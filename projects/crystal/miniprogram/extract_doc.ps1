$word = New-Object -ComObject Word.Application
$word.Visible = $false
$doc = $word.Documents.Open("D:\xjl\AppData\WeChatDevtools\crystal\典型晶体结构三维可视化微信小程序的开发与教学应用 (1).doc")
$text = $doc.Content.Text
$doc.Close()
$word.Quit()
[System.Runtime.InteropServices.Marshal]::ReleaseComObject($doc) | Out-Null
[System.Runtime.InteropServices.Marshal]::ReleaseComObject($word) | Out-Null
Write-Output $text
