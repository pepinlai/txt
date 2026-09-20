(() => {
  const id = new URLSearchParams(location.search).get('draft');
  let drafts = {};
  try { drafts = JSON.parse(localStorage.getItem('novel-dashboard-drafts-v1') || '{}'); } catch { /* ignored */ }
  const draft = id ? drafts[id] : null;
  const content = document.getElementById('content');
  const text = document.getElementById('draft-text');
  const download = document.getElementById('download-txt');
  if (!draft) {
    document.getElementById('mode-label').textContent = '找不到草稿';
    document.getElementById('series-title').textContent = '此草稿不在目前瀏覽器';
    document.getElementById('source-note').textContent = '請從選題儀表板重新生成。草稿會保存在產生它的瀏覽器中。';
    document.querySelector('.concept').hidden = true;
    content.innerHTML = '<p class="note">清除瀏覽器資料會移除尚未下載的草稿。</p>';
    download.hidden = true;
    return;
  }
  document.title = `${draft.title}｜原創短劇稿`;
  document.getElementById('mode-label').textContent = draft.mode === 'full' ? '完整第一季原創短劇稿' : '五集原創短劇稿';
  document.getElementById('series-title').textContent = draft.title;
  document.getElementById('source-note').innerHTML = '<b>版權邊界：</b>此稿依選題類型訊號重新創作，不使用原作角色、設定、事件或結局。';
  document.getElementById('concept').textContent = `生成時間：${new Date(draft.createdAt).toLocaleString('zh-TW')}。可直接閱讀，或下載 TXT 交給後續分鏡／製作流程。`;
  text.textContent = draft.content;
  download.addEventListener('click', () => {
    const file = new Blob([draft.content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(file);
    const link = document.createElement('a');
    link.href = url; link.download = `${draft.title.replace(/[\\/:*?"<>|]/g, '_')}.txt`;
    document.body.append(link); link.click(); link.remove(); URL.revokeObjectURL(url);
  });
})();
