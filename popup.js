const defaults = {
  ollamaModel: 'llama3.2',
  vaultName: 'trabalho-notas',
  targetFolder: '3-estudo/vocabulario'
};

const modelInput = document.getElementById('model');
const vaultInput = document.getElementById('vault');
const folderInput = document.getElementById('folder');
const saveBtn = document.getElementById('save');
const msg = document.getElementById('msg');

chrome.storage.local.get(Object.keys(defaults), saved => {
  const s = { ...defaults, ...saved };
  modelInput.value = s.ollamaModel;
  vaultInput.value = s.vaultName;
  folderInput.value = s.targetFolder;
});

saveBtn.addEventListener('click', () => {
  chrome.storage.local.set({
    ollamaModel: modelInput.value.trim() || defaults.ollamaModel,
    vaultName: vaultInput.value.trim() || defaults.vaultName,
    targetFolder: folderInput.value.trim() || defaults.targetFolder
  }, () => {
    msg.textContent = 'Salvo!';
    setTimeout(() => { msg.textContent = ''; }, 1500);
  });
});
