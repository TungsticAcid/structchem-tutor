/**
 * llm-client.js — OpenAI 兼容的 LLM 客户端
 *
 * 设计要点：
 *   1. 纯前端 fetch，不依赖任何后端（DeepSeek 允许浏览器跨域直连，已实测）。
 *   2. 流式解析三种 delta：reasoning_content（思考）/ content（正文）/ tool_calls（增量拼接）。
 *      ★ DeepSeek 的 reasoning_content 是**独立字段**，与 content 分开流式返回，
 *        且实测推理量很大（单个问题就可烧掉数千 reasoning token），故必须流式渲染，
 *        否则用户会长时间看不到任何反馈。
 *   3. 支持任意 OpenAI 兼容端点（BYOK），端点/模型/密钥全部由设置面板提供。
 *   4. ★ 安全：任何日志输出必须经过 redact()，Authorization 头永不明文出现。
 */
// ★ 错误分类的 message 会经 onError 显示在面板上（用户看得见），故一律走 t()。
// ★ 自己 import 字典（副作用即 registerDict），不依赖入口替你注册
import '../i18n.js'
import { t } from '../../i18n/index.js'
const DEFAULT_ENDPOINT = 'https://api.deepseek.com/chat/completions';
const DEFAULT_MODEL = 'deepseek-flash';
// ★ 这个上限是**思考 + 正文共用**的：推理模型在写正文之前会先烧掉一大段思考，
//   4096 很容易在思考阶段就用光，导致正文一个字都没写出来。默认给足一倍，
//   并允许在设置里调整（见 Settings → 输出上限）。
const DEFAULT_MAX_TOKENS = 8192;

// ---------------------------------------------------------------------------
// 脱敏（安全关键）
// ---------------------------------------------------------------------------
const SENSITIVE_KEYS = /^(authorization|api[-_]?key|x-api-key|token|access[-_]?token|secret|password|passwd)$/i;

/**
 * 深拷贝并把敏感字段替换为掩码。**任何 console 输出前必须过这一层。**
 * 例：{ Authorization: 'Bearer sk-abc...' } → { Authorization: 'Bearer sk-a****wxyz' }
 */
function redact(value, depth) {
  depth = depth || 0;
  if (depth > 6 || value == null) return value;
  if (typeof value === 'string') {
    // 兜底：**长且字母数字混合**的串当成密钥掩码。
    // ★ 原先这里只认 `sk-` 前缀（`/\b(sk-...)/`）—— 非该形态的密钥**原样输出**。
    //   而设置面板写明"任何 OpenAI 兼容服务均可"，现实里的形态远不止一种
    //   （Google `AIzaSy…`、GitHub `ghp_…`、自建服务 `nvapi-…`、各种 JWT）。
    //   实测：那几种在旧实现下**完全不被掩码** —— 一层"安全关键"的脱敏形同虚设。
    return value.replace(/\b(?=[A-Za-z0-9_-]{16,}\b)(?=[A-Za-z0-9_-]*[A-Za-z])(?=[A-Za-z0-9_-]*[0-9])[A-Za-z0-9_-]+\b/g,
      (m) => m.slice(0, 4) + '****' + m.slice(-4));
  }
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  if (typeof value === 'object') {
    const out = {};
    for (const k of Object.keys(value)) {
      out[k] = SENSITIVE_KEYS.test(k) ? maskKey(String(value[k])) : redact(value[k], depth + 1);
    }
    return out;
  }
  return value;
}

/**
 * 把一段凭据变成"可辨识但不泄露"的形式：**保留前 4 后 4、中间全掩**。
 *
 * ★ 为什么不只认 `sk-` 前缀（原实现的写法）：正则要求字面量 `sk-`，
 *   不匹配时 `replace` **原样返回** —— 于是这层脱敏对非 DeepSeek 风格的密钥等于不存在。
 *   凭据字段（`apiKey` / `token` / `authorization` …）的值本来就是密钥，
 *   不必再靠"长得像不像"来判断。
 */
function maskKey(s) {
  const m = /^(Bearer\s+)?(.*)$/i.exec(String(s));
  const pre = (m && m[1]) || '';
  const body = (m && m[2]) || '';
  if (!body) return pre + '****';
  if (body.length <= 8) return pre + '****';
  return pre + body.slice(0, 4) + '****' + body.slice(-4);
}

// ---------------------------------------------------------------------------
// 错误分类（供上层给出可操作的提示）
// ---------------------------------------------------------------------------
function classifyError(status, body) {
  let msg = '';
  try { msg = (typeof body === 'string' ? JSON.parse(body) : body)?.error?.message || ''; } catch (e) { msg = ''; }
  if (status === 401 || status === 403) {
    return { kind: 'auth', status, message: t('agent.llm.auth') };
  }
  if (status === 429) {
    return { kind: 'rate_limit', status, message: t('agent.llm.rateLimit') };
  }
  if (status === 402) {
    return { kind: 'quota', status, message: t('agent.llm.quota') };
  }
  if (status >= 500) {
    return { kind: 'server', status, message: t('agent.llm.serverError', { status }) };
  }
  return { kind: 'http', status, message: msg || t('agent.llm.httpError', { status }) };
}

function normalizeEndpoint(raw) {
  let ep = (raw || '').trim() || DEFAULT_ENDPOINT;
  ep = ep.replace(/\/+$/, '');
  // 容错：用户可能只填了域名或 base，自动补全到 /chat/completions
  if (!/\/chat\/completions$/.test(ep)) {
    if (/\/v\d+$/.test(ep)) ep += '/chat/completions';
    else if (!/\/v\d+\//.test(ep) && !/\/chat\//.test(ep)) ep += '/chat/completions';
  }
  return ep;
}

// ---------------------------------------------------------------------------
// 核心：流式对话
// ---------------------------------------------------------------------------
/**
 * @param {Object}   opts
 * @param {Object}   opts.settings   { endpoint, apiKey, model, effort }
 * @param {Array}    opts.messages   OpenAI 格式消息数组
 * @param {Array}    [opts.tools]    工具定义（JSON Schema）
 * @param {string}   [opts.toolChoice]
 * @param {AbortSignal} [opts.signal]
 * @param {Function} [opts.onDelta]  (evt) => void，evt = { type:'reasoning'|'content'|'tool_call_start', ... }
 * @returns {Promise<{content, reasoning, toolCalls, finishReason, usage}>}
 */
async function chat(opts) {
  const st = opts.settings || {};
  const endpoint = normalizeEndpoint(st.endpoint);
  const apiKey = (st.apiKey || '').trim();
  if (!apiKey) {
    const e = new Error('尚未配置 API Key');
    e.kind = 'no_key';
    throw e;
  }

  /**
   * 组装请求体。omit 用于"被服务端拒绝后降级重试"：
   *   omit.streamOptions / omit.maxTokens 时不发对应的可选字段。
   *
   * ★ 为什么把这两个字段做成可降级的：
   *   · stream_options —— 流式响应默认**不返回 usage**，必须显式索取才拿得到
   *     token 用量；没有它，"输出为什么是空的"就只能靠猜。但个别服务不认识
   *     这个字段会直接 400。
   *   · max_tokens —— 保留它作为**成本闸门**（output token 是计费的，BYOK 下
   *     账单是用户自己的）。但上限因模型而异，用户填大了服务端会 400。
   *   两者都不是用户的错，直接失败太脆，故各自降一级重试一次。
   */
  function buildBody(omit) {
    const b = {
      model: st.model || DEFAULT_MODEL,
      messages: opts.messages,
      stream: true,
    };
    if (!omit.maxTokens) b.max_tokens = opts.maxTokens || DEFAULT_MAX_TOKENS;
    if (!omit.streamOptions) b.stream_options = { include_usage: true };
    if (opts.tools && opts.tools.length) {
      b.tools = opts.tools;
      b.tool_choice = opts.toolChoice || 'auto';
    }
    // effort 为可选参数；参数名以 OpenAI 标准 reasoning_effort 发送，被忽略也无害
    if (st.effort) b.reasoning_effort = st.effort;
    return b;
  }

  const doFetch = (omit) => {
    // ★ 这里给出 `redact()` 的**一处真实调用**。
    //   此前它是"全仓零调用点"—— 文件头与设置存储都写着"任何日志输出前必须经 redact()"，
    //   而那只是一句注释里的约定，没有任何代码执行它（也没有任何测试守着）。
    //   约定不被执行，就等于不存在。
    //   `console.debug` 在浏览器默认的日志级别下**不显示**，排查时要手动把级别调到 Verbose。
    try {
      if (typeof console !== 'undefined' && console.debug) {
        console.debug('[chem-agent] LLM 请求', redact({ endpoint, apiKey, model: st && st.model }));
      }
    } catch (e) { /* 日志绝不能影响请求本身 */ }
    return fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + apiKey,
      },
      body: JSON.stringify(buildBody(omit)),
      signal: opts.signal,
    });
  };

  let res;
  const omit = {};
  try {
    res = await doFetch(omit);
    if (res.status === 400) {
      const txt = await res.clone().text().catch(() => '');
      const low = (txt || '').toLowerCase();
      if (low.indexOf('stream_options') >= 0) omit.streamOptions = true;
      else if (low.indexOf('max_tokens') >= 0 || low.indexOf('max tokens') >= 0) omit.maxTokens = true;
      if (omit.streamOptions || omit.maxTokens) {
        if (opts.onNotice) {
          opts.onNotice({
            kind: 'param_downgrade',
            text: omit.maxTokens
              ? t('agent.llm.downgradeMaxTokens')
              : t('agent.llm.downgradeStreamOptions'),
          });
        }
        res = await doFetch(omit);
      }
    }
  } catch (err) {
    if (err && err.name === 'AbortError') throw err;
    const e = new Error(t('agent.llm.network', {
      msg: err && err.message ? err.message : t('agent.llm.unknownError'),
    }));
    e.kind = 'network';
    throw e;
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    const info = classifyError(res.status, text);
    const e = new Error(info.message);
    e.kind = info.kind;
    e.status = info.status;
    throw e;
  }

  // ---- 流式解析 ----
  const reader = res.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let content = '';
  let reasoning = '';
  let finishReason = null;
  let usage = null;
  const toolAcc = [];              // 按 index 累积

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // SSE 以行分隔；保留最后一段不完整的行
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line || line.startsWith(':')) continue;
      if (!line.startsWith('data:')) continue;
      const payload = line.slice(5).trim();
      if (payload === '[DONE]') { buffer = ''; break; }

      let json;
      try { json = JSON.parse(payload); } catch (e) { continue; }

      if (json.usage) usage = json.usage;

      const choice = json.choices && json.choices[0];
      if (!choice) continue;
      if (choice.finish_reason) finishReason = choice.finish_reason;

      const delta = choice.delta || {};

      // ① 思考流（DeepSeek 特有）
      if (delta.reasoning_content) {
        reasoning += delta.reasoning_content;
        if (opts.onDelta) opts.onDelta({ type: 'reasoning', text: delta.reasoning_content });
      }

      // ② 正文流
      if (delta.content) {
        content += delta.content;
        if (opts.onDelta) opts.onDelta({ type: 'content', text: delta.content });
      }

      // ③ 工具调用（增量拼接，按 index 归并）
      if (delta.tool_calls) {
        for (const tc of delta.tool_calls) {
          const idx = (tc.index != null) ? tc.index : 0;
          if (!toolAcc[idx]) {
            toolAcc[idx] = { id: '', type: 'function', function: { name: '', arguments: '' } };
            if (opts.onDelta) opts.onDelta({ type: 'tool_call_start', index: idx });
          }
          const slot = toolAcc[idx];
          if (tc.id) slot.id = tc.id;
          if (tc.function) {
            if (tc.function.name) slot.function.name += tc.function.name;
            if (tc.function.arguments) slot.function.arguments += tc.function.arguments;
          }
        }
      }
    }
  }

  const toolCalls = toolAcc.filter(Boolean).map((t, i) => ({
    id: t.id || ('call_' + i),
    type: 'function',
    function: { name: t.function.name, arguments: t.function.arguments || '{}' },
  }));

  return { content, reasoning, toolCalls, finishReason, usage };
}

// ---------------------------------------------------------------------------
// 连接测试（设置面板用）：发一个极小的非流式请求
// ---------------------------------------------------------------------------
async function testConnection(settings) {
  const endpoint = normalizeEndpoint(settings.endpoint);
  const apiKey = (settings.apiKey || '').trim();
  if (!apiKey) throw new Error('未填写 API Key');

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey },
    body: JSON.stringify({
      model: settings.model || DEFAULT_MODEL,
      messages: [{ role: 'user', content: 'hi' }],
      max_tokens: 8,
      stream: false,
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    const info = classifyError(res.status, text);
    const e = new Error(info.message); e.kind = info.kind; throw e;
  }
  const json = await res.json().catch(() => null);
  return { ok: true, model: json && json.model ? json.model : (settings.model || DEFAULT_MODEL) };
}

export {
  chat,
  testConnection,
  redact,
  normalizeEndpoint,
  DEFAULT_ENDPOINT,
  DEFAULT_MODEL,
  DEFAULT_MAX_TOKENS,
}
