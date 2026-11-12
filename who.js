/* achieve 共通：だれが使っているか（スタッフ・管理者・オーナー）
   名簿は att_staff。各人に role（staff / admin / owner）と pinHash を持たせる。
   端末ごとに「名前＋個人PIN」で本人確認し、localStorage に覚える。 */
(function () {
  const STORES_W = [['hair', 'achieve'], ['liss', 'Liss'], ['till', 'till'], ['free', '所属なし']];
  const KEY = 'achieve.who';
  const ROLE = { staff: 'スタッフ', admin: '管理者', owner: 'オーナー' };
  const e = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const get = () => { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (x) { return null; } };
  const put = v => { try { v ? localStorage.setItem(KEY, JSON.stringify(v)) : localStorage.removeItem(KEY); } catch (x) {} };
  async function hash(id, pin) {
    const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('achieve:' + id + ':' + String(pin).trim()));
    return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
  }
  const W = {
    ROLE, list: [], ready: false, me: null, step: 'pick', pickId: '', err: '', db: null, onChange: () => {},
    active() { return this.list.filter(p => !p.hidden); },
    isAdmin() { return !!this.me && (this.me.role === 'admin' || this.me.role === 'owner'); },
    isOwner() { return !!this.me && this.me.role === 'owner'; },
    byStore(list) { return STORES_W.map(([id, l]) => [l, list.filter(s => s.store === id)]).concat([['店舗未設定', list.filter(s => !STORES_W.some(x => x[0] === s.store))]]).filter(g => g[1].length); },
    init(db, onChange) {
      this.db = db; this.onChange = onChange;
      db.collection('att_staff').onSnapshot(s => {
        this.list = s.docs.map(d => Object.assign({ id: d.id }, d.data())).sort((a, b) => (a.order || 0) - (b.order || 0));
        this.ready = true; this.check(); this.onChange();
      }, err => { this.err = err.message; this.onChange(); });
    },
    check() {
      const s = get(), p = s && this.list.find(x => x.id === s.id);
      this.me = p && !p.hidden && p.pinHash && p.pinHash === s.h ? p : null;
    },
    gate() {
      if (!this.ready) return '<div class="empty">読み込んでいます</div>';
      if (this.me) return '';
      const hasOwner = this.list.some(p => p.role === 'owner' && p.pinHash && !p.hidden);
      if (!hasOwner || this.step === 'setup') return this.setupView();
      if (this.step === 'pin') {
        const p = this.list.find(x => x.id === this.pickId);
        if (p) return p.pinHash ? `<section class="card login"><h3>${e(p.name)}さん</h3>
          <div class="sub">自分のPINを入れてください。</div>
          <input class="field" id="who-pin" type="password" inputmode="numeric" autocomplete="off" maxlength="8" placeholder="PIN" aria-label="PIN">
          <div class="err" id="who-err">${e(this.err)}</div>
          <button type="button" class="btn primary" data-act="whoPin">入る</button>
          <button type="button" class="btn small" data-act="whoBack">名前を選び直す</button></section>`
          : `<section class="card login"><h3>${e(p.name)}さん</h3><div class="sub">PINがまだ発行されていません。管理者かオーナーに発行してもらってください。</div>
          <button type="button" class="btn small" data-act="whoBack">名前を選び直す</button></section>`;
      }
      const groups = this.byStore(this.active());
      return `<section class="card"><h3>あなたはだれですか？</h3><div class="sub">名前を選んで、自分のPINを入れてください。この端末では次から自動で入ります。</div>
        ${groups.map(([l, arr]) => `<div class="group"><h2>${e(l)}</h2><div class="chips">${arr.map(p => `<button type="button" class="chip" data-act="whoPick" data-id="${p.id}">${e(p.name)}</button>`).join('')}</div></div>`).join('')}
        <div class="sub">名前がないときは、管理者に追加してもらってください。</div></section>`;
    },
    setupView() {
      return `<section class="card login"><h3>オーナーの登録</h3>
        <div class="sub">最初に一度だけ、オーナー（後藤さん）を登録します。今の共通PIN（在庫アプリのPIN）と、オーナー用の自分のPINを入れてください。</div>
        <label class="lbl">名前<input class="field" id="who-oname" value="後藤友弘"></label>
        <label class="lbl">今の共通PIN<input class="field" id="who-shared" type="password" inputmode="numeric" autocomplete="off"></label>
        <label class="lbl">自分のPIN（4桁以上）<input class="field" id="who-opin" type="password" inputmode="numeric" autocomplete="off" maxlength="8"></label>
        <label class="lbl">もう一度<input class="field" id="who-opin2" type="password" inputmode="numeric" autocomplete="off" maxlength="8"></label>
        <div class="err" id="who-err">${e(this.err)}</div>
        <button type="button" class="btn primary" data-act="whoOwner">登録する</button></section>`;
    },
    hash,
    async setPin(id, pin) { const h = await hash(id, pin); await this.db.doc('att_staff/' + id).update({ pinHash: h }); if (this.me && this.me.id === id) put({ id, h }); },
    canManage(p) { if (!this.me) return false; if (this.isOwner()) return true; return this.me.role === 'admin' && (!p || !p.role || p.role === 'staff'); },
    bar() {
      if (!this.me) return '';
      return `${e(this.me.name)}<small>${ROLE[this.me.role || 'staff']}</small>`;
    },
    async handle(act, el) {
      const $ = id => document.getElementById(id);
      this.err = '';
      switch (act) {
        case 'whoPick': this.pickId = el.dataset.id; this.step = 'pin'; this.onChange(); setTimeout(() => $('who-pin') && $('who-pin').focus(), 50); return true;
        case 'whoBack': this.step = 'pick'; this.onChange(); return true;
        case 'whoOut': put(null); this.me = null; this.step = 'pick'; this.onChange(); return true;
        case 'whoPin': {
          const p = this.list.find(x => x.id === this.pickId); if (!p) return true;
          const v = String($('who-pin').value).trim();
          if (!/^\d{4,8}$/.test(v)) { this.err = 'PINは4〜8桁の数字にしてください'; this.onChange(); return true; }
          const h = await hash(p.id, v);
          if (!p.pinHash || h !== p.pinHash) { this.err = 'PINが違います'; this.onChange(); return true; }
          put({ id: p.id, h }); this.step = 'pick'; this.check(); this.onChange(); return true;
        }
        case 'whoOwner': {
          const name = String($('who-oname').value).trim(), shared = String($('who-shared').value).trim(), v = String($('who-opin').value).trim();
          if (!name) { this.err = '名前を入れてください'; this.onChange(); return true; }
          const d = await this.db.doc('settings/app').get();
          if (!d.exists || String(d.data().pin || '') !== shared) { this.err = '共通PINが違います'; this.onChange(); return true; }
          if (!/^\d{4,8}$/.test(v)) { this.err = '自分のPINは4〜8桁の数字にしてください'; this.onChange(); return true; }
          if (v !== String($('who-opin2').value).trim()) { this.err = '2回の入力が違います'; this.onChange(); return true; }
          let p = this.list.find(x => x.name === name);
          const ref = p ? this.db.doc('att_staff/' + p.id) : this.db.collection('att_staff').doc();
          const h = await hash(ref.id, v);
          put({ id: ref.id, h });
          if (p) await ref.update({ role: 'owner', pinHash: h, hidden: false });
          else await ref.set({ name, store: '', start: '', grant: null, hidden: false, order: 0, role: 'owner', pinHash: h, noLeave: true });
          this.step = 'pick'; this.check(); this.onChange(); return true;
        }
      }
      return false;
    },
  };
  window.WHO = W;
})();
