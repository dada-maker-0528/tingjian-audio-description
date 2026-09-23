(() => {
  // outputs/听见_短视频助手_演示/src/core.mjs
  function parseCommand(raw) {
    const text = String(raw).trim().replace(/[，。！？!?、\s]/g, "").replace(/^(请|帮我|给我)/, "");
    if (/^(下一条|下一个|下个|下一个视频|下个视频)+$/.test(text)) return { type: "next" };
    if (/^(上一条|上一个|上个|上一个视频|上个视频)+$/.test(text)) return { type: "previous" };
    if (/^(暂停|暂停播放|停一下|停止播放|先停一下)$/.test(text)) return { type: "pause" };
    if (/^(继续|继续播放|播放|开始播放)$/.test(text)) return { type: "play" };
    const seek2 = text.match(/^(快进|前进|后退|倒退)(\d+|五|十|十五|二十|三十)?秒?$/);
    if (seek2) {
      const n = Number(seek2[2]) || { \u4E94: 5, \u5341: 10, \u5341\u4E94: 15, \u4E8C\u5341: 20, \u4E09\u5341: 30 }[seek2[2]] || 5;
      return { type: "seek", seconds: (seek2[1] === "\u540E\u9000" || seek2[1] === "\u5012\u9000" ? -1 : 1) * Math.min(n, 60) };
    }
    return { type: "question", text: String(raw).trim() };
  }
  function swipeDirection(dx, dy) {
    return Math.abs(dy) >= 50 && Math.abs(dy) > Math.abs(dx) * 1.25 ? dy < 0 ? 1 : -1 : 0;
  }
  var PlaybackGate = class {
    constructor() {
      this.intent = true;
      this.epoch = 0;
      this.serial = 0;
      this.speech = null;
      this.input = false;
    }
    get canPlay() {
      return this.intent && !this.input && !this.speech?.hold;
    }
    setPlaying(value) {
      this.intent = value;
      return this.canPlay;
    }
    beginSpeech(hold) {
      const token = `${this.epoch}:${++this.serial}`;
      this.speech = { token, hold };
      return token;
    }
    holdSpeech(token) {
      if (this.speech?.token === token) this.speech.hold = true;
    }
    finishSpeech(token) {
      if (this.speech?.token !== token) return { valid: false, resume: false };
      const held2 = this.speech.hold;
      this.speech = null;
      return { valid: true, resume: held2 && this.canPlay };
    }
    cancelSpeech() {
      this.serial++;
      this.speech = null;
    }
    beginInput() {
      this.cancelSpeech();
      this.input = true;
    }
    finishInput() {
      this.input = false;
      return this.canPlay;
    }
    switchClip() {
      this.epoch++;
      this.cancelSpeech();
      this.input = false;
    }
  };
  function keyAction(event, { held: held2 = false, editable = false, hasDraft = false, active = false } = {}) {
    if (event.isComposing || event.keyCode === 229 || event.ctrlKey || event.metaKey || event.altKey) return null;
    if (event.key === "Escape") return event.type === "keydown" ? "cancel" : null;
    if (event.code === "Space" || event.key === " ") {
      if (event.type === "keyup") return held2 ? "release" : null;
      return !editable && !event.repeat && !held2 ? "record" : null;
    }
    if (event.type === "keydown" && event.key === "Enter" && !event.shiftKey && (hasDraft || active)) return held2 ? "wait-release" : "send";
    return null;
  }
  var errors = { "not-allowed": "\u672A\u83B7\u5F97\u9EA6\u514B\u98CE\u6743\u9650\uFF0C\u53EF\u4EE5\u8F93\u5165\u6587\u5B57\u6216\u4F7F\u7528\u4E0B\u9762\u7684\u6F14\u793A\u6307\u4EE4\u3002", "service-not-allowed": "\u6B64\u6D4F\u89C8\u5668\u7684\u8BC6\u522B\u670D\u52A1\u4E0D\u53EF\u7528\uFF0C\u53EF\u4EE5\u76F4\u63A5\u8F93\u5165\u3002", "audio-capture": "\u65E0\u6CD5\u8BFB\u53D6\u9EA6\u514B\u98CE\uFF0C\u8BF7\u68C0\u67E5\u8BBE\u5907\u540E\u91CD\u8BD5\u3002", network: "\u8BED\u97F3\u8BC6\u522B\u8FDE\u63A5\u5931\u8D25\uFF0C\u672A\u53D1\u9001\u3002\u8BF7\u91CD\u8BD5\u6216\u8F93\u5165\u6587\u5B57\u3002", "no-speech": "\u6CA1\u6709\u542C\u6E05\uFF0C\u8BF7\u91CD\u65B0\u6309\u4F4F\u7A7A\u683C\u8BF4\u8BDD\u3002" };
  var HoldToTalk = class {
    constructor({ factory = () => {
      const C = globalThis.SpeechRecognition || globalThis.webkitSpeechRecognition;
      return C ? new C() : null;
    }, onState = () => {
    }, onText = () => {
    }, onSend = () => {
    }, beforeStart = () => {
    }, timeout = 6e3 } = {}) {
      Object.assign(this, { factory, onState, onText, onSend, beforeStart, timeout });
      this.state = "idle";
      this.serial = 0;
      this.current = null;
      this.base = "";
    }
    get active() {
      return ["starting", "recording", "stopping"].includes(this.state);
    }
    stateTo(state, message) {
      this.state = state;
      this.onState(state, message);
    }
    start(prefix = "") {
      if (this.active) return false;
      let r;
      try {
        r = this.factory();
      } catch {
      }
      if (!r) {
        this.stateTo("error", "\u5F53\u524D\u6D4F\u89C8\u5668\u4E0D\u652F\u6301\u8BED\u97F3\u8BC6\u522B\u3002\u53EF\u4EE5\u8F93\u5165\u6587\u5B57\uFF0C\u6216\u70B9\u51FB\u6F14\u793A\u6307\u4EE4\u3002");
        return false;
      }
      this.base = prefix;
      this.beforeStart();
      const s = { id: ++this.serial, r, final: "", interim: "", send: false, released: false };
      this.current = s;
      const alive = () => this.current === s && s.id === this.serial;
      const value = () => [this.base, s.final + s.interim].filter(Boolean).join(" ");
      r.lang = "zh-CN";
      r.continuous = true;
      r.interimResults = true;
      r.onstart = () => {
        if (!alive()) {
          try {
            r.abort();
          } catch {
          }
          return;
        }
        if (s.released) {
          try {
            r.stop();
          } catch {
          }
          return;
        }
        this.stateTo("recording", "\u6B63\u5728\u542C\uFF0C\u677E\u5F00\u7A7A\u683C\u7ED3\u675F\u3002");
      };
      r.onresult = (e) => {
        if (!alive()) return;
        let final = "", interim = "";
        for (const item of Array.from(e.results)) {
          if (item.isFinal) final += item[0]?.transcript || "";
          else interim += item[0]?.transcript || "";
        }
        s.final = final;
        s.interim = interim;
        this.onText(value());
      };
      r.onerror = (e) => {
        if (!alive()) return;
        this.cleanup();
        this.onText(value());
        this.stateTo("error", errors[e.error] || "\u8BC6\u522B\u672A\u5B8C\u6210\uFF0C\u672A\u53D1\u9001\u3002\u53EF\u4EE5\u4FEE\u6539\u6587\u5B57\u540E\u53D1\u9001\u3002");
        try {
          r.abort();
        } catch {
        }
      };
      r.onend = () => {
        if (!alive()) return;
        this.cleanup();
        this.onText(value());
        if (!s.final.trim() || s.interim.trim()) {
          this.stateTo("error", s.interim.trim() ? "\u8FD8\u6709\u672A\u786E\u8BA4\u7684\u6587\u5B57\uFF0C\u8BF7\u6838\u5BF9\u540E\u518D\u6309\u56DE\u8F66\u3002" : "\u6CA1\u6709\u8BC6\u522B\u5230\u65B0\u5185\u5BB9\uFF0C\u8BF7\u91CD\u8BD5\u3002");
          return;
        }
        this.stateTo("ready", "\u8BC6\u522B\u5B8C\u6210\u3002\u56DE\u8F66\u53D1\u9001\uFF0CEsc \u53D6\u6D88\u3002");
        if (s.send) {
          this.state = "idle";
          this.onSend(value());
        }
      };
      this.stateTo("starting", "\u6B63\u5728\u5F00\u542F\u9EA6\u514B\u98CE\u3002\u9996\u6B21\u4F7F\u7528\u9700\u8981\u6D4F\u89C8\u5668\u6388\u6743\u3002");
      this.durationTimer = setTimeout(() => {
        if (alive()) this.release();
      }, 45e3);
      try {
        r.start();
        return true;
      } catch {
        this.cleanup();
        this.stateTo("error", "\u9EA6\u514B\u98CE\u672A\u80FD\u542F\u52A8\uFF0C\u53EF\u4EE5\u76F4\u63A5\u8F93\u5165\u6587\u5B57\u3002");
        return false;
      }
    }
    release() {
      const s = this.current;
      if (!s || s.released) return false;
      s.released = true;
      clearTimeout(this.durationTimer);
      this.stateTo("stopping", "\u6B63\u5728\u786E\u8BA4\u6700\u540E\u51E0\u4E2A\u5B57\u2026");
      this.stopTimer = setTimeout(() => {
        if (this.current !== s) return;
        this.cleanup();
        this.stateTo("error", "\u8BC6\u522B\u7ED3\u675F\u8D85\u65F6\uFF0C\u672A\u53D1\u9001\u3002\u8BF7\u68C0\u67E5\u6587\u5B57\u540E\u91CD\u8BD5\u3002");
        try {
          s.r.abort();
        } catch {
        }
      }, this.timeout);
      try {
        s.r.stop();
      } catch {
      }
      return true;
    }
    requestSend() {
      if (!this.current) return false;
      this.current.send = true;
      this.release();
      return true;
    }
    cancel() {
      const s = this.current;
      this.serial++;
      this.cleanup();
      try {
        s?.r.abort();
      } catch {
      }
      this.onText(this.base);
      this.stateTo("idle", "\u5DF2\u53D6\u6D88\u8BED\u97F3\u8F93\u5165\u3002");
    }
    cleanup() {
      clearTimeout(this.stopTimer);
      clearTimeout(this.durationTimer);
      this.stopTimer = null;
      this.durationTimer = null;
      this.current = null;
    }
  };

  // outputs/听见_短视频助手_演示/src/video-region.mjs
  function pictureRect(bounds, width, height, fit = "contain") {
    if (!width || !height || bounds.width <= 0 || bounds.height <= 0) return null;
    if (fit === "cover") return { left: bounds.left, top: bounds.top, width: bounds.width, height: bounds.height };
    const scale = Math.min(bounds.width / width, bounds.height / height), w = width * scale, h = height * scale;
    return { left: bounds.left + (bounds.width - w) / 2, top: bounds.top + (bounds.height - h) / 2, width: w, height: h };
  }
  function findVideoRegion(candidates, viewport) {
    let best = null, area = 0;
    for (const candidate of candidates) {
      if (candidate.visible === false) continue;
      const rect = pictureRect(candidate.bounds, candidate.width, candidate.height, candidate.fit);
      if (!rect) continue;
      const w = Math.max(0, Math.min(rect.left + rect.width, viewport.width) - Math.max(0, rect.left));
      const h = Math.max(0, Math.min(rect.top + rect.height, viewport.height) - Math.max(0, rect.top));
      if (w >= 80 && h >= 80 && w * h > area) {
        area = w * h;
        best = { candidate, rect };
      }
    }
    return best;
  }

  // outputs/听见_短视频助手_演示/src/overlay-layout.mjs
  function overlayLayout(videoRect, surface, viewport, searching = false) {
    const host = surface || { left: 0, top: 0, width: viewport.width, height: viewport.height };
    const local = videoRect ? { left: videoRect.left - host.left, top: videoRect.top - host.top, width: videoRect.width, height: videoRect.height } : null;
    const frame = searching ? surface ? { left: 6, top: 27, width: host.width - 12, height: host.height - 84 } : { left: 18, top: 18, width: Math.max(100, host.width - 36), height: Math.max(100, host.height - 114) } : local;
    return { frame, captionWidth: surface ? Math.max(100, host.width - 76) : local ? Math.max(180, Math.min(760, local.width - 32)) : null, captionBottom: surface ? 210 : local ? Math.max(100, host.height - local.top - local.height + 24) : 100, chipTop: surface ? 120 : local ? local.top + 14 : 50 };
  }

  // outputs/听见_短视频助手_演示/src/clips.mjs
  var clips = [
    { title: "\u57CE\u5E02\u9A91\u884C", start: 0, end: 12.2, description: "\u8F66\u6D41\u4E2D\u7684\u4E00\u6BB5\u9A91\u884C\uFF0C\u9752\u5E74\u5E26\u7740\u5973\u5B69\u5411\u524D\u7A7F\u884C\u3002", brief: "\u9752\u5E74\u9A91\u8F66\uFF0C\u5973\u5B69\u5750\u5728\u4ED6\u8EAB\u524D\u3002", detail: "\u9752\u5E74\u7A7F\u7740\u9EC4\u8272\u4E0A\u8863\uFF0C\u6234\u7740\u5934\u76D4\u9A91\u8F66\u3002\u5973\u5B69\u5750\u5728\u4ED6\u7684\u8EAB\u524D\u3002", detailAudio: "ride-detail", cues: [{ at: 3.6, text: "\u9752\u5E74\u9A91\u8F66\uFF0C\u5973\u5B69\u5750\u5728\u4ED6\u8EAB\u524D\u3002", audio: "ride-brief", hold: false, until: 6.8 }] },
    { title: "\u591C\u95F4\u5546\u8C08", start: 19.96, end: 40.32, description: "\u591C\u95F4\u7684\u5546\u8C08\uFF0C\u7559\u610F\u4EBA\u7269\u7684\u8868\u60C5\u4E0E\u52A8\u4F5C\u3002", brief: "\u8FD9\u662F\u591C\u95F4\u5546\u8C08\u65E7\u624B\u673A\u7684\u7247\u6BB5\u3002", detail: "\u8FD9\u662F\u591C\u95F4\u5546\u8C08\u65E7\u624B\u673A\u7684\u7247\u6BB5\u3002\u753B\u9762\u4E2D\u53EF\u4EE5\u770B\u5230\u666F\u6D69\u4F4E\u5934\u3001\u76B1\u7709\u7684\u8868\u60C5\u3002", detailAudio: "night-detail", cues: [{ at: 1.5, text: "\u753B\u9762\u8F6C\u5230\u591C\u95F4\u5546\u8C08\u65E7\u624B\u673A\u7684\u573A\u666F\u3002", audio: "night-intro", hold: true }, { at: 14.39, text: "\u666F\u6D69\u4F4E\u7740\u5934\uFF0C\u7709\u5934\u5FAE\u5FAE\u76B1\u8D77\u3002", audio: "night-brief", hold: false, until: 18.89 }] },
    { title: "\u5382\u623F\u52B3\u4F5C", start: 103.92, end: 116.56, description: "\u955C\u5934\u6765\u5230\u5382\u623F\uFF0C\u5DE5\u4EBA\u4EEC\u5728\u5DE5\u4F5C\u53F0\u524D\u5FD9\u788C\u3002", brief: "\u5DE5\u4EBA\u5750\u5728\u5DE5\u4F5C\u53F0\u524D\uFF0C\u5206\u5934\u5FD9\u788C\u3002", detail: "\u955C\u5934\u6765\u5230\u5382\u623F\uFF0C\u5DE5\u4EBA\u4EEC\u5750\u5728\u5DE5\u4F5C\u53F0\u524D\uFF0C\u5404\u81EA\u5FD9\u788C\u3002", detailAudio: "factory-detail", cues: [{ at: 6.48, text: "\u5DE5\u4EBA\u5750\u5728\u5DE5\u4F5C\u53F0\u524D\uFF0C\u5206\u5934\u5FD9\u788C\u3002", audio: "factory-brief", hold: false, until: 10.48 }] }
  ];

  // outputs/听见_短视频助手_演示/src/app.mjs
  var $ = (s) => document.querySelector(s);
  var video = $("#video");
  var audio = $("#reader-audio") || new Audio();
  var input = $("#input");
  var gate = new PlaybackGate();
  var portrait = document.body.dataset.layout === "portrait";
  var audioBase = document.body.dataset.audioBase || "assets";
  var readerSurface = $("[data-reader-surface]");
  var index = 0;
  var started = false;
  var enabled = false;
  var held = false;
  var switching = false;
  var scanPhase = "searching";
  var located = false;
  var userSetMute = false;
  var announced = /* @__PURE__ */ new Set();
  var deadline = null;
  var noticeTimer;
  var scanTimer;
  var lockTimer;
  var scanVersion = 0;
  var wheelAt = 0;
  var dragStart = null;
  var suppressVideoClickUntil = 0;
  var clip = () => clips[index];
  var relative = () => Math.max(0, Math.min(clip().end - clip().start, video.currentTime - clip().start));
  var clock = (t) => `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(Math.floor(t % 60)).padStart(2, "0")}`;
  function notice(text) {
    $("#notice").textContent = text;
    $("#notice").hidden = false;
    clearTimeout(noticeTimer);
    noticeTimer = setTimeout(() => $("#notice").hidden = true, 2600);
  }
  function drawRegion() {
    const candidates = Array.from(document.querySelectorAll("video")).map((element) => {
      const style = getComputedStyle(element);
      return { element, bounds: element.getBoundingClientRect(), width: element.videoWidth, height: element.videoHeight, fit: style.objectFit, visible: style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0" };
    });
    const match = findVideoRegion(candidates, { width: innerWidth, height: innerHeight }), frame = $("#scan-frame");
    located = !!match;
    frame.hidden = !match && scanPhase !== "searching";
    const layout = overlayLayout(match?.rect, readerSurface?.getBoundingClientRect(), { width: innerWidth, height: innerHeight }, scanPhase === "searching"), target = layout.frame;
    if (target) Object.assign(frame.style, { left: target.left + "px", top: target.top + "px", width: target.width + "px", height: target.height + "px" });
    if (match) {
      $("#caption").style.maxWidth = layout.captionWidth + "px";
      $("#caption").style.bottom = layout.captionBottom + "px";
      $("#event-chip").style.top = layout.chipTop + "px";
    }
    document.body.dataset.scanPhase = scanPhase;
    render();
  }
  function scan(full = true) {
    clearTimeout(scanTimer);
    clearTimeout(lockTimer);
    const version = ++scanVersion;
    scanPhase = full ? "searching" : "following";
    const frame = $("#scan-frame");
    frame.classList.remove("locking");
    frame.classList.toggle("scanning", full);
    drawRegion();
    scanTimer = setTimeout(() => {
      if (version !== scanVersion) return;
      scanPhase = "locking";
      frame.classList.remove("scanning");
      frame.classList.add("locking");
      drawRegion();
      lockTimer = setTimeout(() => {
        if (version !== scanVersion) return;
        scanPhase = "locked";
        frame.classList.remove("locking");
        drawRegion();
      }, 460);
    }, full ? 1050 : 240);
  }
  function render() {
    const capture = gate.input, reading = !!gate.speech;
    const status = capture ? voice.active ? "\u6B63\u5728\u542C" : "\u5F85\u53D1\u9001" : scanPhase === "searching" ? readerSurface ? "\u626B\u63CF\u5C4F\u5E55" : "\u626B\u63CF\u9875\u9762" : scanPhase === "locking" ? "\u9501\u5B9A\u89C6\u9891" : scanPhase === "following" ? "\u8DDF\u968F\u65B0\u89C6\u9891" : !located ? "\u672A\u627E\u5230\u89C6\u9891" : reading ? "\u8BB2\u8FF0\u4E2D" : enabled ? "\u8DDF\u968F\u4E2D" : "\u5DF2\u9501\u5B9A\u89C6\u9891";
    $("#reader-status").textContent = status;
    $("#region-tag").textContent = scanPhase === "searching" ? "\u6B63\u5728\u5BFB\u627E\u89C6\u9891\u533A\u57DF" : scanPhase === "locking" ? "\u5DF2\u8BC6\u522B \xB7 \u6B63\u5728\u9501\u5B9A" : scanPhase === "following" ? "\u68C0\u6D4B\u5230\u89C6\u9891\u5207\u6362" : reading ? "\u542C\u89C1 \xB7 \u6B63\u5728\u8BB2\u8FF0" : "\u542C\u89C1 \xB7 \u5DF2\u9501\u5B9A\u89C6\u9891";
    $("#scan-frame").classList.toggle("is-reading", reading);
    $("#reader-toggle").textContent = enabled ? "\u505C\u6B62\u6717\u8BFB" : "\u5F00\u542F\u6717\u8BFB";
    $("#reader-toggle").setAttribute("aria-pressed", String(enabled));
    $("#reader-toggle").disabled = !located || ["searching", "locking"].includes(scanPhase);
    $("#play").textContent = gate.intent ? "\u6682\u505C" : "\u64AD\u653E";
    $("#play").setAttribute("aria-label", gate.intent ? "\u6682\u505C\u89C6\u9891" : "\u64AD\u653E\u89C6\u9891");
    $("#mute").textContent = video.muted ? "\u539F\u58F0\u5173" : "\u539F\u58F0\u5F00";
    $("#mute").setAttribute("aria-label", video.muted ? "\u5F00\u542F\u539F\u58F0" : "\u5173\u95ED\u539F\u58F0");
    const chip = $("#event-chip");
    chip.hidden = !gate.speech?.hold;
    if (!chip.hidden) chip.textContent = gate.intent ? "\u89C6\u9891\u5DF2\u6682\u505C\uFF0C\u8865\u5145\u540E\u7EE7\u7EED" : "\u89C6\u9891\u5DF2\u6682\u505C";
    document.body.classList.toggle("recording", voice.active);
  }
  function updateTime() {
    const t = relative();
    $("#time").textContent = `${clock(t)} / ${clock(clip().end - clip().start)}`;
    $("#seek").max = clip().end - clip().start;
    $("#seek").value = t;
    $("#seek").setAttribute("aria-valuetext", `${clock(t)}\uFF0C\u5171${clock(clip().end - clip().start)}`);
  }
  function sync() {
    if (gate.canPlay && !switching) {
      video.play()?.catch(() => {
        gate.setPlaying(false);
        render();
        notice("\u8BF7\u70B9\u51FB\u89C6\u9891\u7EE7\u7EED\u64AD\u653E\u3002");
      });
    } else video.pause();
    render();
  }
  function stopAudio() {
    audio.pause();
    audio.onended = null;
    audio.onerror = null;
    gate.cancelSpeech();
    deadline = null;
    $("#caption").hidden = true;
  }
  function finishAudio(token) {
    const result = gate.finishSpeech(token);
    if (!result.valid) return;
    audio.pause();
    deadline = null;
    $("#caption").hidden = true;
    if (result.resume) sync();
    else render();
  }
  function speak(text, file, { hold = true, until = null } = {}) {
    stopAudio();
    const token = gate.beginSpeech(hold);
    deadline = until === null ? null : clip().start + until;
    $("#caption-text").textContent = text;
    $("#caption").hidden = false;
    if (hold) video.pause();
    render();
    audio.src = `${audioBase}/${file}.wav`;
    audio.onended = () => finishAudio(token);
    audio.onerror = () => audioError(token);
    audio.play().catch(() => audioError(token));
  }
  function audioError(token) {
    if (gate.speech?.token !== token) return;
    gate.setPlaying(false);
    stopAudio();
    render();
    notice("\u65C1\u767D\u672A\u80FD\u64AD\u653E\uFF0C\u8BF7\u70B9\u51FB\u89C6\u9891\u7EE7\u7EED\u3002");
  }
  function unlockSound() {
    if (started) return;
    started = true;
    if (!userSetMute) video.muted = false;
  }
  function toggleReader() {
    unlockSound();
    enabled = !enabled;
    if (enabled) {
      const cue = clip().cues[0];
      if (cue && !gate.input) {
        announced.add(cue.at);
        speak(cue.text, cue.audio, { hold: true });
      }
    } else {
      stopAudio();
      sync();
    }
    render();
  }
  function metadata() {
    const c = clip();
    $("#clip-title").textContent = c.title;
    $("#clip-counter").textContent = `${String(index + 1).padStart(2, "0")} / 03`;
    if ($("#dy-description")) $("#dy-description").textContent = c.description;
    video.setAttribute("aria-label", c.title + "\uFF0C\u6F14\u793A\u89C6\u9891");
    if (portrait) video.style.objectPosition = [52, 58, 50][index] + "% center";
    updateTime();
  }
  function setMenu(open) {
    $("#quick-menu").hidden = !open;
    $("#more").setAttribute("aria-expanded", String(open));
  }
  function openCommand(title = "\u8F93\u5165\u6307\u4EE4") {
    setMenu(false);
    $("#command-panel").hidden = false;
    $("#command-title").textContent = title;
  }
  function closeCommand() {
    held = false;
    input.value = "";
    voice.base = "";
    voice.state = "idle";
    $("#command-panel").hidden = true;
    updateInput();
    $("#hold-button").focus({ preventScroll: true });
  }
  function selectClip(next) {
    if (voice.active || gate.input) voice.cancel();
    stopAudio();
    gate.switchClip();
    closeCommand();
    setMenu(false);
    index = (next + clips.length) % clips.length;
    announced = /* @__PURE__ */ new Set();
    gate.setPlaying(true);
    switching = true;
    video.pause();
    metadata();
    if (video.readyState) {
      video.currentTime = clip().start;
      if (!video.seeking && Math.abs(video.currentTime - clip().start) < 0.05) {
        switching = false;
        sync();
      }
    }
    scan(false);
    render();
  }
  function seek(seconds) {
    stopAudio();
    const t = Math.min(clip().end - 0.08, Math.max(clip().start, video.currentTime + seconds));
    video.currentTime = t;
    announced = new Set(clip().cues.filter((c) => c.at < t - clip().start).map((c) => c.at));
    updateTime();
    sync();
  }
  function updateInput() {
    const active = voice.active;
    input.readOnly = active;
    $("#send").disabled = !input.value.trim() && !active;
    $("#hold-button").setAttribute("aria-pressed", String(active));
    document.body.classList.toggle("recording", active);
  }
  var voice = new HoldToTalk({
    beforeStart() {
      unlockSound();
      stopAudio();
      gate.beginInput();
      video.pause();
      openCommand("\u6B63\u5728\u542C\u4F60\u8BF4\u8BDD");
      render();
    },
    onText(text) {
      input.value = text;
      updateInput();
    },
    onState(next, text) {
      $("#voice-status").textContent = text;
      updateInput();
      if (next === "starting" || next === "recording") openCommand("\u6B63\u5728\u542C\u4F60\u8BF4\u8BDD");
      if (next === "stopping") $("#command-title").textContent = "\u6B63\u5728\u786E\u8BA4\u6587\u5B57";
      if (next === "ready" || next === "error") {
        openCommand(next === "ready" ? "\u56DE\u8F66\u53D1\u9001\uFF0CEsc \u53D6\u6D88" : "\u53EF\u4EE5\u6539\u7528\u6587\u5B57\u8F93\u5165");
        input.focus({ preventScroll: true });
      }
      if (next === "error" && !input.value.trim()) {
        gate.finishInput();
        sync();
      } else render();
    },
    onSend: (text) => submit(text)
  });
  function startRecording() {
    if (voice.active) return;
    held = voice.start(input.value);
    updateInput();
  }
  function releaseRecording() {
    held = false;
    if (voice.active) voice.release();
    updateInput();
  }
  function cancelInput() {
    held = false;
    voice.cancel();
    gate.finishInput();
    $("#command-panel").hidden = true;
    updateInput();
    $("#hold-button").focus({ preventScroll: true });
    sync();
  }
  function submit(raw = input.value) {
    const text = String(raw).trim();
    if (!text) return;
    if (voice.active) {
      voice.requestSend();
      return;
    }
    unlockSound();
    stopAudio();
    const command = parseCommand(text);
    closeCommand();
    if (command.type === "next" || command.type === "previous") {
      selectClip(index + (command.type === "next" ? 1 : -1));
      return;
    }
    if (command.type === "pause") {
      gate.setPlaying(false);
      gate.finishInput();
      sync();
      notice("\u5DF2\u6682\u505C");
      return;
    }
    if (command.type === "play") {
      gate.setPlaying(true);
      gate.finishInput();
      sync();
      return;
    }
    if (command.type === "seek") {
      gate.finishInput();
      seek(command.seconds);
      return;
    }
    gate.finishInput();
    if (/画面|视频|什么|谁|人物|描述|讲|介绍|细节|衣服|穿/.test(text)) speak(clip().detail, clip().detailAudio, { hold: true });
    else {
      sync();
      notice("\u53EF\u4EE5\u8BF4\u201C\u4E0B\u4E00\u4E2A\u201D\u201C\u6682\u505C\u201D\uFF0C\u6216\u8BE2\u95EE\u5F53\u524D\u753B\u9762\u3002");
    }
  }
  $("#reader-toggle").onclick = toggleReader;
  $("#more").onclick = () => setMenu($("#quick-menu").hidden);
  $("#type-command").onclick = () => {
    voice.base = input.value;
    openCommand("\u8F93\u5165\u63A7\u5236\u6307\u4EE4");
    $("#voice-status").textContent = "\u56DE\u8F66\u53D1\u9001 \xB7 Esc \u53D6\u6D88";
    input.focus();
  };
  $("#rescan").onclick = () => {
    setMenu(false);
    scan();
  };
  $("#cancel-input").onclick = cancelInput;
  $("#send").onclick = () => {
    if (held) {
      notice("\u5148\u677E\u5F00\u7A7A\u683C\uFF0C\u518D\u53D1\u9001\u3002");
      return;
    }
    submit();
  };
  input.addEventListener("input", updateInput);
  $("#next").onclick = () => selectClip(index + 1);
  $("#previous").onclick = () => selectClip(index - 1);
  $("#play").onclick = () => {
    if (gate.input) cancelInput();
    stopAudio();
    gate.setPlaying(!gate.intent);
    sync();
  };
  $("#mute").onclick = () => {
    userSetMute = true;
    video.muted = !video.muted;
    render();
  };
  $("#seek").addEventListener("input", (e) => seek(clip().start + Number(e.target.value) - video.currentTime));
  video.onclick = () => {
    if (Date.now() > suppressVideoClickUntil) $("#play").click();
  };
  video.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    dragStart = { x: e.clientX, y: e.clientY };
    video.setPointerCapture(e.pointerId);
  });
  video.addEventListener("pointerup", (e) => {
    if (!dragStart) return;
    const direction = swipeDirection(e.clientX - dragStart.x, e.clientY - dragStart.y);
    dragStart = null;
    if (direction) {
      e.preventDefault();
      suppressVideoClickUntil = Date.now() + 400;
      selectClip(index + direction);
    }
  });
  video.addEventListener("pointercancel", () => dragStart = null);
  var holdButton = $("#hold-button");
  holdButton.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    holdButton.setPointerCapture(e.pointerId);
    startRecording();
  });
  holdButton.addEventListener("pointerup", releaseRecording);
  holdButton.addEventListener("pointercancel", cancelInput);
  holdButton.addEventListener("lostpointercapture", () => {
    if (held) releaseRecording();
  });
  function keyboard(e) {
    const editable = !!e.target.closest("textarea,input,select,[contenteditable=true]");
    if (e.type === "keydown" && !e.repeat && !editable && !voice.active && !e.ctrlKey && !e.metaKey && !e.altKey && !e.isComposing && ["ArrowDown", "ArrowUp"].includes(e.key)) {
      e.preventDefault();
      selectClip(index + (e.key === "ArrowDown" ? 1 : -1));
      return;
    }
    const action = keyAction(e, { held, editable, hasDraft: !!input.value.trim(), active: voice.active });
    if (!action) return;
    e.preventDefault();
    if (action === "record") startRecording();
    if (action === "release") releaseRecording();
    if (action === "send") submit();
    if (action === "wait-release") notice("\u5148\u677E\u5F00\u7A7A\u683C\uFF0C\u518D\u6309\u56DE\u8F66\u53D1\u9001\u3002");
    if (action === "cancel") {
      if (voice.active || gate.input || !$("#command-panel").hidden) cancelInput();
      else if (!$("#quick-menu").hidden) {
        setMenu(false);
        $("#more").focus();
      } else {
        stopAudio();
        gate.setPlaying(false);
        sync();
      }
    }
  }
  document.addEventListener("keydown", keyboard);
  document.addEventListener("keyup", keyboard);
  document.addEventListener("pointerdown", (e) => {
    if (!e.target.closest("#quick-menu,#more")) setMenu(false);
  });
  window.addEventListener("blur", () => {
    if (held || voice.active) {
      gate.setPlaying(false);
      cancelInput();
    }
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      if (voice.active || held) cancelInput();
      stopAudio();
      gate.setPlaying(false);
      video.pause();
      render();
    } else drawRegion();
  });
  video.addEventListener("loadedmetadata", () => {
    video.currentTime = clip().start;
    switching = false;
    metadata();
    scan();
    sync();
  });
  video.addEventListener("seeked", () => {
    if (video.currentTime >= clip().start - 0.1 && video.currentTime < clip().end) {
      switching = false;
      sync();
      drawRegion();
    }
  });
  video.addEventListener("timeupdate", () => {
    updateTime();
    if (switching) return;
    if (video.currentTime >= clip().end - 0.04) {
      video.currentTime = clip().start;
      return;
    }
    if (gate.speech && deadline !== null && video.currentTime >= deadline) {
      gate.holdSpeech(gate.speech.token);
      video.pause();
      render();
    }
    if (!started || !enabled || !located || video.paused || gate.speech || gate.input) return;
    const cue = clip().cues.find((c) => !announced.has(c.at) && relative() >= c.at && relative() < c.at + 0.8);
    if (cue) {
      announced.add(cue.at);
      speak(cue.text, cue.audio, { hold: cue.hold, until: cue.until ?? null });
    }
  });
  video.addEventListener("error", () => {
    gate.setPlaying(false);
    render();
    notice("\u89C6\u9891\u7D20\u6750\u672A\u80FD\u52A0\u8F7D\uFF0C\u8BF7\u4FDD\u7559\u5B8C\u6574\u7684\u6F14\u793A\u6587\u4EF6\u5939\u3002");
  });
  for (const event of ["play", "pause", "ended"]) video.addEventListener(event, () => document.body.classList.toggle("video-playing", !video.paused));
  document.querySelectorAll("[data-demo-note]").forEach((button) => button.addEventListener("click", () => notice(button.dataset.demoNote)));
  for (const id of ["like", "collect", "follow"]) {
    const button = $("#" + id);
    if (button) button.addEventListener("click", () => {
      const active = button.getAttribute("aria-pressed") !== "true";
      button.setAttribute("aria-pressed", String(active));
      button.classList.toggle("is-active", active);
      if (id === "follow") button.querySelector("span").textContent = active ? "\u2713" : "+";
    });
  }
  video.addEventListener("wheel", (e) => {
    if (Math.abs(e.deltaY) < 45 || Date.now() - wheelAt < 800) return;
    e.preventDefault();
    wheelAt = Date.now();
    selectClip(index + (e.deltaY > 0 ? 1 : -1));
  }, { passive: false });
  new ResizeObserver(drawRegion).observe(video);
  window.addEventListener("resize", drawRegion);
  document.addEventListener("fullscreenchange", drawRegion);
  metadata();
  updateInput();
  scan();
  render();
})();
