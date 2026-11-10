// Live-Verbindung zwischen zwei Spielern.
// Spieldaten laufen direkt von Gerät zu Gerät über einen WebRTC-Datenkanal.
// Zum Verbindungsaufbau (Angebot/Antwort/ICE) dient der öffentliche PeerJS-Server;
// er sieht nur die Verbindungsdaten, kein Spielgeschehen. Der Server prüft das
// PeerJS-Nachrichtenformat (type/connectionId/…), deshalb halten wir uns genau daran.
// Kommt keine direkte Verbindung zustande (sehr strenge Netze), meldet onClose('p2p').

const SERVER = 'wss://0.peerjs.com:443/peerjs';
const PREFIX = 'pallet-rush-live-v1-';
const ICE = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];
const P2P_TIMEOUT = 15000; // ms ohne Datenkanal → aufgeben

export const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function newCode() {
  const a = new Uint32Array(4);
  crypto.getRandomValues(a);
  return Array.from(a, (v) => CODE_CHARS[v % CODE_CHARS.length]).join('');
}
export const validCode = (c) => typeof c === 'string' && /^[A-HJ-NP-Z2-9]{4}$/.test(c);

export class LiveLink {
  // hooks: onOpen(), onMessage(obj), onClose(reason)
  constructor(hooks) {
    this.hooks = hooks;
    this.ws = null;
    this.pc = null;
    this.ch = null;
    this.peer = null;
    this.cid = 'dc_' + Math.random().toString(36).slice(2, 12);
    this.connected = false;
    this.closed = false;
    this.cands = [];
    this.timers = [];
  }

  // Raum öffnen und auf Gegner warten
  async host(code) {
    await this._open(PREFIX + code);
    this.isHost = true;
  }

  // Raum beitreten
  async join(code) {
    await this._open(PREFIX + code + '-' + Math.random().toString(36).slice(2, 8));
    this.isHost = false;
    this.peer = PREFIX + code;
    this._makePc();
    this._wire(this.pc.createDataChannel('game', { ordered: true }));
    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);
    this._ws({ type: 'OFFER', dst: this.peer, payload: {
      sdp: this._sdp(), type: 'data', connectionId: this.cid, label: this.cid,
      serialization: 'json', reliable: true, metadata: { kind: 'pr' }, browser: 'chrome',
    } });
    // Antwortet niemand, gibt es den Raum nicht
    this._later(10000, () => { if (!this.connected && !this.gotAnswer) this._fail('notfound'); });
    this._later(P2P_TIMEOUT, () => { if (!this.connected) this._fail('p2p'); });
  }

  send(obj) {
    if (this.closed) return;
    const s = JSON.stringify(obj);
    if (this.ch && this.ch.readyState === 'open') { try { this.ch.send(s); } catch {} }
  }

  close() {
    if (this.closed) return;
    if (this.peer) this._ws({ type: 'LEAVE', dst: this.peer });
    this.closed = true;
    this._cleanup();
  }

  // ---------- intern ----------
  _later(ms, fn) { this.timers.push(setTimeout(fn, ms)); }

  _open(id) {
    return new Promise((resolve, reject) => {
      const token = Math.random().toString(36).slice(2, 12);
      let ws;
      try { ws = new WebSocket(`${SERVER}?key=peerjs&id=${encodeURIComponent(id)}&token=${token}&version=1.5.4`); }
      catch { reject(new Error('net')); return; }
      this.ws = ws;
      let opened = false;
      const to = setTimeout(() => { if (!opened) { reject(new Error('net')); try { ws.close(); } catch {} } }, 10000);
      ws.onmessage = (e) => {
        let m;
        try { m = JSON.parse(e.data); } catch { return; }
        if (m.type === 'OPEN') { opened = true; clearTimeout(to); resolve(); return; }
        if (!opened && (m.type === 'ID-TAKEN' || m.type === 'ERROR')) { clearTimeout(to); reject(new Error(m.type === 'ID-TAKEN' ? 'taken' : 'net')); return; }
        this._signal(m);
      };
      ws.onerror = () => { if (!opened) { clearTimeout(to); reject(new Error('net')); } };
      ws.onclose = () => {
        if (!opened) return;
        // Ohne Server geht es nur weiter, wenn der direkte Kanal steht
        if (!this.closed && !(this.ch && this.ch.readyState === 'open')) this._fail(this.connected ? 'left' : 'net');
      };
      this.hb = setInterval(() => this._ws({ type: 'HEARTBEAT' }), 5000);
    });
  }

  _sdp() {
    const d = this.pc.localDescription;
    return { type: d.type, sdp: d.sdp };
  }

  _ws(m) {
    if (this.ws && this.ws.readyState === 1) {
      try { this.ws.send(JSON.stringify(m)); } catch {}
    }
  }

  _makePc() {
    const pc = new RTCPeerConnection({ iceServers: ICE });
    this.pc = pc;
    pc.onicecandidate = (e) => {
      if (e.candidate && this.peer) this._ws({ type: 'CANDIDATE', dst: this.peer, payload: { candidate: e.candidate.toJSON(), type: 'data', connectionId: this.cid } });
    };
    pc.ondatachannel = (e) => this._wire(e.channel);
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed' && !this.connected) this._fail('p2p');
    };
  }

  _wire(ch) {
    this.ch = ch;
    ch.onopen = () => this._up();
    ch.onmessage = (e) => this._msg(e.data);
    ch.onclose = () => { if (!this.closed) this._fail('left'); };
  }

  _up() {
    if (this.connected || this.closed) return;
    this.connected = true;
    this.hooks.onOpen?.();
  }

  _msg(s) {
    let o;
    try { o = JSON.parse(s); } catch { return; }
    if (o && typeof o === 'object') this.hooks.onMessage?.(o);
  }

  async _signal(m) {
    if (this.closed) return;
    const p = m.payload || {};
    if (m.type === 'OFFER') {
      if (!this.isHost || p.metadata?.kind !== 'pr') return;
      if (this.peer && m.src !== this.peer) { this._ws({ type: 'LEAVE', dst: m.src }); return; } // Raum voll
      this.peer = m.src;
      this.cid = p.connectionId || this.cid;
      this._makePc();
      await this.pc.setRemoteDescription(p.sdp);
      await this._flush();
      const ans = await this.pc.createAnswer();
      await this.pc.setLocalDescription(ans);
      this._ws({ type: 'ANSWER', dst: this.peer, payload: { sdp: this._sdp(), type: 'data', connectionId: this.cid, browser: 'chrome' } });
      this._later(P2P_TIMEOUT, () => { if (!this.connected) this._fail('p2p'); });
    } else if (m.type === 'ANSWER') {
      if (m.src !== this.peer || !this.pc) return;
      this.gotAnswer = true;
      await this.pc.setRemoteDescription(p.sdp);
      await this._flush();
    } else if (m.type === 'CANDIDATE') {
      if (m.src !== this.peer) return;
      if (!p.candidate) return;
      if (this.pc && this.pc.remoteDescription) { try { await this.pc.addIceCandidate(p.candidate); } catch {} }
      else this.cands.push(p.candidate);
    } else if (m.type === 'LEAVE') {
      if (m.src === this.peer) this._fail('left');
    } else if (m.type === 'EXPIRE') {
      if (!this.connected) this._fail('notfound');
    }
  }

  async _flush() {
    const list = this.cands;
    this.cands = [];
    for (const c of list) { try { await this.pc.addIceCandidate(c); } catch {} }
  }

  _fail(reason) {
    if (this.closed) return;
    this.closed = true;
    this._cleanup();
    this.hooks.onClose?.(reason);
  }

  _cleanup() {
    clearInterval(this.hb);
    for (const t of this.timers) clearTimeout(t);
    this.timers = [];
    try { this.ch?.close(); } catch {}
    try { this.pc?.close(); } catch {}
    try { this.ws?.close(); } catch {}
  }
}
