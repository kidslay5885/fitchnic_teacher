(function () {
  'use strict';

  const WEBHOOK_URL = 'https://discord.com/api/webhooks/1497098725104029797/pTVoGhrb4_9LOj4993umaPAcNfdSJnTgfsLHwpjOt75dohrTM2Ut2-eObD-fbjTHXWnf';

  const DEFAULT_AVATAR = 'data:image/png;base64,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';

  const currentScript = document.currentScript;
  const config = {
    siteName:
      (currentScript && currentScript.getAttribute('data-site-name')) ||
      document.title ||
      '이름 없음',
    autoButton:
      !currentScript ||
      currentScript.getAttribute('data-auto-button') !== 'false',
    buttonText:
      (currentScript && currentScript.getAttribute('data-button-text')) ||
      '개발자에게 문의',
    ownerName:
      (currentScript && currentScript.getAttribute('data-owner-name')) ||
      '핏크닉',
    ownerAvatar:
      (currentScript && currentScript.getAttribute('data-owner-avatar')) ||
      DEFAULT_AVATAR,
    ownerInitial:
      (currentScript && currentScript.getAttribute('data-owner-initial')) ||
      '핏',
  };

  const STYLE_ID = 'fitpicnic-contact-widget-style';
  const CSS = `
    .fpc-fab{position:fixed;right:20px;bottom:20px;z-index:2147483000;display:inline-flex;align-items:center;gap:0;padding:6px 10px 6px 6px;border:1px solid #e5e5e5;border-radius:999px;background:#fff;color:#111;font-size:14px;font-weight:600;cursor:pointer;box-shadow:0 8px 24px rgba(0,0,0,.12);font-family:inherit;transition:padding .25s ease,box-shadow .2s ease}
    .fpc-fab:hover{padding:6px 16px 6px 6px;box-shadow:0 12px 28px rgba(0,0,0,.18)}
    .fpc-fab .fpc-avatar{width:40px;height:40px;border-radius:50%;background:linear-gradient(135deg,#6a8cff,#8b5cf6);color:#fff;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:700;overflow:hidden;flex-shrink:0}
    .fpc-fab .fpc-avatar img{width:100%;height:100%;object-fit:cover;display:block}
    .fpc-fab .fpc-label{max-width:0;overflow:hidden;white-space:nowrap;opacity:0;padding:0;font-size:14px;color:#111;font-weight:600;line-height:1.2;transition:max-width .25s ease,opacity .2s ease,padding .25s ease}
    .fpc-fab:hover .fpc-label{max-width:240px;opacity:1;padding:0 10px 0 8px}
    .fpc-fab .fpc-dot{width:10px;height:10px;border-radius:50%;background:#22c55e;flex-shrink:0;margin-left:4px}
    .fpc-backdrop{position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:2147483001;display:flex;align-items:center;justify-content:center;padding:16px;font-family:system-ui,-apple-system,"Segoe UI",Roboto,"Apple SD Gothic Neo","Malgun Gothic",sans-serif}
    .fpc-modal{background:#fff;border-radius:12px;width:100%;max-width:420px;padding:24px;box-shadow:0 20px 60px rgba(0,0,0,.3);box-sizing:border-box}
    .fpc-modal-header{display:flex;align-items:center;gap:12px;margin-bottom:14px}
    .fpc-modal-header .fpc-avatar{width:44px;height:44px;border-radius:50%;background:linear-gradient(135deg,#6a8cff,#8b5cf6);color:#fff;display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:700;overflow:hidden;flex-shrink:0}
    .fpc-modal-header .fpc-avatar img{width:100%;height:100%;object-fit:cover;display:block}
    .fpc-modal-header .fpc-who h3{margin:0;font-size:16px;color:#111}
    .fpc-modal-header .fpc-who p{margin:2px 0 0;font-size:12px;color:#666}
    .fpc-modal .fpc-site{margin:0 0 14px;font-size:12px;color:#888;padding:8px 10px;background:#f7f7f8;border-radius:8px}
    .fpc-modal input[type=text],.fpc-modal textarea{width:100%;padding:12px;border:1px solid #ddd;border-radius:8px;font-size:14px;font-family:inherit;box-sizing:border-box;outline:none}
    .fpc-modal input[type=text]{margin-bottom:8px}
    .fpc-modal textarea{min-height:140px;resize:vertical}
    .fpc-modal input[type=text]:focus,.fpc-modal textarea:focus{border-color:#111}
    .fpc-actions{display:flex;gap:8px;justify-content:flex-end;margin-top:12px}
    .fpc-btn{padding:10px 16px;border-radius:8px;border:none;font-size:14px;font-weight:600;cursor:pointer;font-family:inherit}
    .fpc-btn-primary{background:#111;color:#fff}
    .fpc-btn-primary:hover{background:#333}
    .fpc-btn-primary:disabled{background:#888;cursor:not-allowed}
    .fpc-btn-ghost{background:transparent;color:#555}
    .fpc-btn-ghost:hover{background:#f2f2f2}
    .fpc-msg{margin-top:10px;font-size:13px;min-height:18px}
    .fpc-msg.err{color:#c0392b}
    .fpc-msg.ok{color:#2a8a3e}
    .fpc-attach-row{display:flex;align-items:center;gap:8px;margin-top:8px}
    .fpc-attach-btn{display:inline-flex;align-items:center;gap:6px;padding:8px 12px;border:1px dashed #ccc;border-radius:8px;background:#fafafa;color:#555;font-size:13px;cursor:pointer;font-family:inherit}
    .fpc-attach-btn:hover{background:#f0f0f0;border-color:#999}
    .fpc-attach-hint{font-size:12px;color:#999}
    .fpc-thumbs{display:flex;gap:8px;margin-top:8px;flex-wrap:wrap}
    .fpc-thumb{position:relative;width:64px;height:64px;border-radius:8px;overflow:hidden;border:1px solid #eee;background:#f5f5f5}
    .fpc-thumb img{width:100%;height:100%;object-fit:cover;display:block}
    .fpc-thumb-remove{position:absolute;top:2px;right:2px;width:20px;height:20px;border-radius:50%;background:rgba(0,0,0,.7);color:#fff;border:none;cursor:pointer;font-size:12px;line-height:1;display:flex;align-items:center;justify-content:center;padding:0;font-family:inherit}
    .fpc-thumb-remove:hover{background:#000}
  `;

  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = CSS;
    document.head.appendChild(style);
  }

  function openModal() {
    if (document.querySelector('.fpc-backdrop')) return;

    const backdrop = document.createElement('div');
    backdrop.className = 'fpc-backdrop';
    backdrop.innerHTML = `
      <div class="fpc-modal" role="dialog" aria-modal="true">
        <div class="fpc-modal-header">
          <div class="fpc-avatar">${avatarInner()}</div>
          <div class="fpc-who">
            <h3>${escapeHtml(config.buttonText)}</h3>
            <p>개발자가 직접 확인해요</p>
          </div>
        </div>
        <p class="fpc-site">📍 ${escapeHtml(config.siteName)}</p>
        <input type="text" placeholder="이름 (어떻게 불러드릴까요?)" maxlength="40" />
        <textarea placeholder="편하게 말씀해주세요. 최대한 빠르게 답변드릴게요."></textarea>
        <div class="fpc-attach-row">
          <button type="button" class="fpc-attach-btn" data-action="attach">📎 이미지 첨부</button>
          <span class="fpc-attach-hint">선택, 최대 3장 · 8MB 이하</span>
        </div>
        <div class="fpc-thumbs"></div>
        <input type="file" accept="image/*" multiple style="display:none" />
        <div class="fpc-msg" aria-live="polite"></div>
        <div class="fpc-actions">
          <button type="button" class="fpc-btn fpc-btn-ghost" data-action="cancel">취소</button>
          <button type="button" class="fpc-btn fpc-btn-primary" data-action="send">보내기</button>
        </div>
      </div>
    `;

    const nameInput = backdrop.querySelector('input[type="text"]');
    const textarea = backdrop.querySelector('textarea');
    const fileInput = backdrop.querySelector('input[type="file"]');
    const attachBtn = backdrop.querySelector('[data-action="attach"]');
    const thumbsEl = backdrop.querySelector('.fpc-thumbs');
    const msg = backdrop.querySelector('.fpc-msg');
    const sendBtn = backdrop.querySelector('[data-action="send"]');
    const cancelBtn = backdrop.querySelector('[data-action="cancel"]');

    const MAX_FILES = 3;
    const MAX_SIZE = 8 * 1024 * 1024;
    const attachedFiles = [];

    const close = () => backdrop.remove();

    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) close();
    });
    cancelBtn.addEventListener('click', close);

    attachBtn.addEventListener('click', () => fileInput.click());

    fileInput.addEventListener('change', (e) => {
      const picked = Array.from(e.target.files || []);
      let rejected = '';
      for (const f of picked) {
        if (attachedFiles.length >= MAX_FILES) {
          rejected = `최대 ${MAX_FILES}장까지 첨부 가능합니다.`;
          break;
        }
        if (!f.type.startsWith('image/')) {
          rejected = '이미지 파일만 첨부할 수 있어요.';
          continue;
        }
        if (f.size > MAX_SIZE) {
          rejected = `${f.name}: 파일이 너무 큽니다 (8MB 이하)`;
          continue;
        }
        attachedFiles.push(f);
      }
      fileInput.value = '';
      renderThumbs();
      if (rejected) {
        msg.textContent = rejected;
        msg.className = 'fpc-msg err';
      } else {
        msg.textContent = '';
        msg.className = 'fpc-msg';
      }
    });

    function renderThumbs() {
      thumbsEl.innerHTML = '';
      attachedFiles.forEach((f, idx) => {
        const thumb = document.createElement('div');
        thumb.className = 'fpc-thumb';
        const img = document.createElement('img');
        img.alt = '';
        const reader = new FileReader();
        reader.onload = (ev) => { img.src = ev.target.result; };
        reader.readAsDataURL(f);
        const rm = document.createElement('button');
        rm.type = 'button';
        rm.className = 'fpc-thumb-remove';
        rm.setAttribute('aria-label', '첨부 제거');
        rm.textContent = '✕';
        rm.addEventListener('click', () => {
          attachedFiles.splice(idx, 1);
          renderThumbs();
        });
        thumb.appendChild(img);
        thumb.appendChild(rm);
        thumbsEl.appendChild(thumb);
      });
    }

    sendBtn.addEventListener('click', async () => {
      const name = nameInput.value.trim();
      const content = textarea.value.trim();
      if (!name) {
        msg.textContent = '이름을 입력해주세요.';
        msg.className = 'fpc-msg err';
        nameInput.focus();
        return;
      }
      if (!content) {
        msg.textContent = '문의 내용을 입력해주세요.';
        msg.className = 'fpc-msg err';
        textarea.focus();
        return;
      }
      sendBtn.disabled = true;
      msg.textContent = '전송 중...';
      msg.className = 'fpc-msg';
      try {
        await sendToDiscord(config.siteName, name, content, attachedFiles);
        msg.textContent = '전송되었습니다. 감사합니다!';
        msg.className = 'fpc-msg ok';
        setTimeout(close, 1200);
      } catch (err) {
        msg.textContent = '전송에 실패했습니다. 잠시 후 다시 시도해주세요.';
        msg.className = 'fpc-msg err';
        sendBtn.disabled = false;
      }
    });

    document.body.appendChild(backdrop);
    setTimeout(() => nameInput.focus(), 50);
  }

  async function sendToDiscord(siteName, name, content, files) {
    const payload = {
      username: '핏크닉 문의 봇',
      embeds: [
        {
          title: '새 문의 도착',
          color: 0x5865f2,
          fields: [
            { name: '사이트', value: siteName || '이름 없음', inline: false },
            { name: '이름', value: truncate(name, 200), inline: false },
            { name: '문의 내용', value: truncate(content, 1000), inline: false },
          ],
          timestamp: new Date().toISOString(),
        },
      ],
    };

    let res;
    if (files && files.length > 0) {
      const fd = new FormData();
      fd.append('payload_json', JSON.stringify(payload));
      files.forEach((f, i) => {
        fd.append(`files[${i}]`, f, f.name);
      });
      res = await fetch(WEBHOOK_URL, { method: 'POST', body: fd });
    } else {
      res = await fetch(WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    }
    if (!res.ok) throw new Error('webhook failed: ' + res.status);
  }

  function truncate(s, n) {
    return s.length > n ? s.slice(0, n - 1) + '…' : s;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    }[c]));
  }

  function avatarInner() {
    if (config.ownerAvatar) {
      return `<img src="${escapeHtml(config.ownerAvatar)}" alt="" />`;
    }
    return escapeHtml(config.ownerInitial);
  }

  function mountAutoButton() {
    if (document.querySelector('.fpc-fab')) return;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'fpc-fab';
    btn.setAttribute('aria-label', config.buttonText);
    btn.innerHTML = `
      <span class="fpc-avatar">${avatarInner()}</span>
      <span class="fpc-label">${escapeHtml(config.buttonText)}</span>
      <span class="fpc-dot" aria-hidden="true"></span>
    `;
    btn.addEventListener('click', openModal);
    document.body.appendChild(btn);
  }

  function bindManualTriggers() {
    document.querySelectorAll('[data-contact-widget]').forEach((el) => {
      if (el.dataset.fpcBound) return;
      el.dataset.fpcBound = '1';
      el.addEventListener('click', (e) => {
        e.preventDefault();
        openModal();
      });
    });
  }

  function init() {
    injectStyle();
    bindManualTriggers();
    if (config.autoButton) {
      mountAutoButton();
    }
  }

  window.FitpicnicContact = {
    open: openModal,
    setSiteName(name) {
      config.siteName = name;
    },
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
