(function (window) {
  'use strict';

  var audioCtx = null;
  var masterGain = null;
  var muted = false;
  var initialized = false;

  function initAudio() {
    if (initialized) return;
    initialized = true;

    var AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;

    audioCtx = new AudioContextClass();
    masterGain = audioCtx.createGain();
    masterGain.gain.value = 1.0;
    masterGain.connect(audioCtx.destination);
  }

  function resumeContext() {
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
  }

  function onFirstInteraction() {
    initAudio();
    resumeContext();
    document.removeEventListener('click', onFirstInteraction);
    document.removeEventListener('touchstart', onFirstInteraction);
  }

  document.addEventListener('click', onFirstInteraction);
  document.addEventListener('touchstart', onFirstInteraction);

  function isReady() {
    return audioCtx && masterGain && !muted;
  }

  function createNoiseSource(duration) {
    var bufferSize = audioCtx.sampleRate * duration;
    var buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    var data = buffer.getChannelData(0);
    for (var i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1);
    }
    var source = audioCtx.createBufferSource();
    source.buffer = buffer;
    return source;
  }

  function playHit() {
    if (!isReady()) return;

    var now = audioCtx.currentTime;
    var duration = 0.05;

    var source = createNoiseSource(duration);

    var filter = audioCtx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 2000;

    var gainNode = audioCtx.createGain();
    gainNode.gain.setValueAtTime(1.0, now);
    gainNode.gain.exponentialRampToValueAtTime(0.001, now + duration);

    source.connect(filter);
    filter.connect(gainNode);
    gainNode.connect(masterGain);

    source.start(now);
    source.stop(now + duration);
  }

  function playSkill() {
    if (!isReady()) return;

    var now = audioCtx.currentTime;
    var duration = 0.15;

    var osc = audioCtx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(200, now);
    osc.frequency.linearRampToValueAtTime(800, now + duration);

    var gainNode = audioCtx.createGain();
    gainNode.gain.setValueAtTime(0.5, now);
    gainNode.gain.exponentialRampToValueAtTime(0.001, now + duration);

    osc.connect(gainNode);
    gainNode.connect(masterGain);

    osc.start(now);
    osc.stop(now + duration);
  }

  function playCrit() {
    if (!isReady()) return;

    var now = audioCtx.currentTime;
    var duration = 0.1;

    var noiseSource = createNoiseSource(duration);

    var noiseGain = audioCtx.createGain();
    noiseGain.gain.setValueAtTime(0.8, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    noiseSource.connect(noiseGain);
    noiseGain.connect(masterGain);

    var osc = audioCtx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1200, now);

    var oscGain = audioCtx.createGain();
    oscGain.gain.setValueAtTime(0.9, now);
    oscGain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    osc.connect(oscGain);
    oscGain.connect(masterGain);

    noiseSource.start(now);
    noiseSource.stop(now + duration);
    osc.start(now);
    osc.stop(now + duration);
  }

  function playDeath() {
    if (!isReady()) return;

    var now = audioCtx.currentTime;
    var duration = 0.3;

    var osc = audioCtx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(400, now);
    osc.frequency.linearRampToValueAtTime(100, now + duration);

    var gainNode = audioCtx.createGain();
    gainNode.gain.setValueAtTime(0.6, now);
    gainNode.gain.exponentialRampToValueAtTime(0.001, now + duration);

    osc.connect(gainNode);
    gainNode.connect(masterGain);

    osc.start(now);
    osc.stop(now + duration);
  }

  function playShield() {
    if (!isReady()) return;

    var now = audioCtx.currentTime;
    var duration = 0.15;

    var osc = audioCtx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1000, now);

    var gainNode = audioCtx.createGain();
    gainNode.gain.setValueAtTime(0.0, now);
    gainNode.gain.linearRampToValueAtTime(0.5, now + 0.02);
    gainNode.gain.exponentialRampToValueAtTime(0.001, now + duration);

    osc.connect(gainNode);
    gainNode.connect(masterGain);

    osc.start(now);
    osc.stop(now + duration);
  }

  function playBuff() {
    if (!isReady()) return;

    var notes = [523, 659, 784];
    var noteDuration = 0.06;

    for (var i = 0; i < notes.length; i++) {
      (function (freq, offset) {
        var now = audioCtx.currentTime + offset;

        var osc = audioCtx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now);

        var gainNode = audioCtx.createGain();
        gainNode.gain.setValueAtTime(0.4, now);
        gainNode.gain.exponentialRampToValueAtTime(0.001, now + noteDuration);

        osc.connect(gainNode);
        gainNode.connect(masterGain);

        osc.start(now);
        osc.stop(now + noteDuration);
      })(notes[i], i * noteDuration);
    }
  }

  function toggleMute() {
    muted = !muted;

    if (masterGain) {
      masterGain.gain.value = muted ? 0 : 1.0;
    }

    var muteBtns = document.querySelectorAll('#mute-btn, #mute-btn-survival');
    for (var i = 0; i < muteBtns.length; i++) {
      muteBtns[i].textContent = muted ? '🔇' : '🔊';
    }
  }

  window.SoundEngine = {
    playHit: playHit,
    playSkill: playSkill,
    playCrit: playCrit,
    playDeath: playDeath,
    playShield: playShield,
    playBuff: playBuff,
    toggleMute: toggleMute
  };

})(window);
