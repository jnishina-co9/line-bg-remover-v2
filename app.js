/* No imports or network requests: works directly from index.html. */
'use strict';

// Smooth color-distance key; decontaminate only the partially transparent edge.
function removeColor(source, key, tolerance, softness, correction) {
  const out = new Uint8ClampedArray(source);
  for (let i = 0; i < out.length; i += 4) {
    if (!source[i + 3]) continue;
    const distance = Math.hypot(source[i] - key[0], source[i + 1] - key[1], source[i + 2] - key[2]);
    const t = softness === 0 ? (distance <= tolerance ? 0 : 1) : Math.max(0, Math.min(1, (distance - tolerance) / softness));
    const alpha = t * t * (3 - 2 * t);
    out[i + 3] = Math.round(source[i + 3] * alpha);
    if (alpha === 0) { out[i] = out[i + 1] = out[i + 2] = 0; continue; }
    if (alpha < 1 && correction > 0) {
      for (let c = 0; c < 3; c++) {
        const clean = Math.max(0, Math.min(255, (source[i + c] - key[c] * (1 - alpha)) / alpha));
        out[i + c] = source[i + c] + (clean - source[i + c]) * correction;
      }
    }
  }
  return out;
}

if (typeof document !== 'undefined') {
  const $ = id => document.getElementById(id);
  const original = $('original'), result = $('result');
  const uploadPreview = $('upload-preview');
  const previewWrap = $('upload-preview-wrap');
  let previewUrl = null;
  previewWrap.addEventListener('click', e => e.stopPropagation());
  const ctx = original.getContext('2d', { willReadFrequently: true });
  const resultCtx = result.getContext('2d');
  let source = null, name = '', generation = 0, timer = null, revision = 0;
  const rgb = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
  const hex = values => '#' + values.map(v => v.toString(16).padStart(2, '0')).join('').toUpperCase();
  function setColor(value) { $('color').value = value; $('hex').value = value.toUpperCase(); }
  function schedule() {
    clearTimeout(timer);
    revision++;
    $('save').disabled = true;
    if (!source) return;
    if (!/^#[\da-f]{6}$/i.test($('hex').value)) {
      $('status').textContent = '色コードは #5AFF19 のように # と6桁の英数字で入力してください。';
      return;
    }
    $('status').textContent = '背景を除去しています…';
    timer = setTimeout(() => {
      try {
        const pixels = removeColor(source.data, rgb($('hex').value), 80, 100, 1);
        resultCtx.putImageData(new ImageData(pixels, source.width, source.height), 0, 0);
        result.dataset.loaded = 'true';
        $('result-preview-panel').hidden = false;
        $('save').disabled = false;
        $('status').textContent = '背景を除去しました。透過PNGで保存できます。';
      } catch (error) {
        $('status').textContent = '画像の処理に失敗しました。大きすぎる画像は縮小して、もう一度選択してください。';
        console.error(error);
      }
    }, 100);
  }
  function estimateColor(data, width, height) {
    const samples = [];
    for (const [x, y] of [[0, 0], [width - 1, 0], [0, height - 1], [width - 1, height - 1]]) {
      const i = (y * width + x) * 4;
      if (data[i + 3] > 240) samples.push(Array.from(data.slice(i, i + 3)));
    }
    if (!samples.length) return null;
    // Select the corner that agrees most closely with the other corners.
    return samples.reduce((best, sample) => {
      const score = value => samples.reduce((sum, s) => sum + Math.hypot(...s.map((v, c) => v - value[c])), 0);
      return score(sample) < score(best) ? sample : best;
    });
  }
  async function load(file) {
    if (!file || !file.type.startsWith('image/')) return;
    const token = ++generation;
    clearTimeout(timer);
    revision++;
    source = null;
    $('save').disabled = true;
    $('original-preview-panel').hidden = true;
    $('original-status').textContent = '';
    $('result-preview-panel').hidden = true;
    delete original.dataset.loaded;
    delete result.dataset.loaded;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    const url = URL.createObjectURL(file);
    previewUrl = url;
    uploadPreview.src = url;
    previewWrap.hidden = false;
    $('status').textContent = '画像を読み込んでいます…';
    try {
      const image = new Image();
      image.src = url;
      await image.decode();
      if (token !== generation) return;
      original.width = result.width = image.naturalWidth;
      original.height = result.height = image.naturalHeight;
      ctx.drawImage(image, 0, 0);
      source = ctx.getImageData(0, 0, original.width, original.height);
      name = file.name.replace(/\.[^.]+$/, '');
      original.dataset.loaded = 'true';
      $('original-preview-panel').hidden = false;
      $('original-status').textContent = '画像をクリックして背景色を取得してください。';
      const estimated = estimateColor(source.data, source.width, source.height);
      if (estimated) setColor(hex(estimated));
      schedule();
    } catch (error) {
      if (token !== generation) return;
      source = null;
      $('status').textContent = '画像を読み込めませんでした。ブラウザで表示できる画像か確認してください。';
      console.error(error);
    }
  }
  function handleFiles(files) {
    const imageFiles = Array.from(files).filter(file => file.type.startsWith('image/'));
    if (imageFiles.length === 0) return;
    load(imageFiles[0]);
  }
  $('file').addEventListener('change', e => { handleFiles(e.target.files); e.target.value = ''; });
  const dropzone = $('dropzone');
  dropzone.addEventListener('click', () => $('file').click());
  $('file').addEventListener('click', e => e.stopPropagation());
  dropzone.addEventListener('dragover', e => { e.preventDefault(); dropzone.classList.add('dragging'); });
  dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragging'));
  dropzone.addEventListener('drop', e => { e.preventDefault(); dropzone.classList.remove('dragging'); handleFiles(e.dataTransfer.files); });
  original.addEventListener('click', e => {
    if (!source) return;
    const rect = original.getBoundingClientRect();
    const x = Math.max(0, Math.min(source.width - 1, Math.floor((e.clientX - rect.left) * source.width / rect.width)));
    const y = Math.max(0, Math.min(source.height - 1, Math.floor((e.clientY - rect.top) * source.height / rect.height)));
    const i = (y * source.width + x) * 4;
    if (!source.data[i + 3]) { $('status').textContent = 'すでに透明な場所です。色のある背景部分を選んでください。'; return; }
    setColor(hex(Array.from(source.data.slice(i, i + 3))));
    schedule();
  });
  $('color').addEventListener('input', e => { setColor(e.target.value); schedule(); });
  $('hex').addEventListener('input', e => {
    if (/^#[\da-f]{6}$/i.test(e.target.value)) $('color').value = e.target.value;
    schedule();
  });
  $('preview-bg').addEventListener('change', e => { $('result-wrap').className = 'canvas-wrap ' + e.target.value; });
  $('save').addEventListener('click', () => {
    if (!source || $('save').disabled) return;
    const savedName = name, savedRevision = revision;
    $('save').disabled = true;
    result.toBlob(blob => {
      if (savedRevision !== revision) return;
      $('save').disabled = false;
      if (!blob) { $('status').textContent = 'PNGの作成に失敗しました。画像を縮小してやり直してください。'; return; }
      const url = URL.createObjectURL(blob), link = document.createElement('a');
      link.href = url; link.download = savedName + '_nobg.png';
      document.body.appendChild(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      $('status').textContent = '保存を開始しました。ブラウザのダウンロード先を確認してください。';
    }, 'image/png');
  });
}

