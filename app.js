const recordButton = document.querySelector("#record-button");
const stopButton = document.querySelector("#stop-button");
const timer = document.querySelector("#timer");
const status = document.querySelector("#status");
const statusText = document.querySelector("#status-text");
const recorderHint = document.querySelector("#recorder-hint");
const micOrbit = document.querySelector("#mic-orbit");
const editor = document.querySelector("#editor");
const emptyEditor = document.querySelector("#empty-editor");
const editorContent = document.querySelector("#editor-content");
const audioPlayer = document.querySelector("#audio-player");
const waveform = document.querySelector("#waveform");
const selectionLine = document.querySelector("#selection-line");
const startRange = document.querySelector("#start-range");
const endRange = document.querySelector("#end-range");
const startTime = document.querySelector("#start-time");
const endTime = document.querySelector("#end-time");
const durationLabel = document.querySelector("#duration-label");
const previewButton = document.querySelector("#preview-button");
const saveButton = document.querySelector("#save-button");
const shareButton = document.querySelector("#share-button");
const toast = document.querySelector("#toast");

let mediaRecorder;
let chunks = [];
let audioBlob;
let audioBuffer;
let audioUrl;
let audioContext;
let sourceNode;
let previewing = false;
let startedAt = 0;
let timerInterval;
let toastTimeout;

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("is-visible");
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => toast.classList.remove("is-visible"), 3600);
}

function formatTime(seconds, hundredths = false) {
  const safeSeconds = Math.max(0, seconds);
  const minutes = Math.floor(safeSeconds / 60).toString().padStart(2, "0");
  const wholeSeconds = Math.floor(safeSeconds % 60).toString().padStart(2, "0");
  if (!hundredths) return `${minutes}:${wholeSeconds}`;
  const fraction = Math.floor((safeSeconds % 1) * 100).toString().padStart(2, "0");
  return `${minutes}:${wholeSeconds}<span>.${fraction}</span>`;
}

function updateTimer() {
  timer.innerHTML = formatTime((Date.now() - startedAt) / 1000, true);
}

function setRecordingState(recording) {
  status.classList.toggle("is-recording", recording);
  micOrbit.classList.toggle("is-recording", recording);
  statusText.textContent = recording ? "녹음 중" : "준비됐어요";
  recorderHint.textContent = recording ? "녹음 중이에요. 완료 버튼을 눌러 마무리하세요" : "마이크 버튼을 눌러 녹음을 시작하세요";
  recordButton.disabled = recording;
  stopButton.disabled = !recording;
}

async function startRecording() {
  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
    showToast("이 브라우저에서는 녹음을 지원하지 않아요. 최신 브라우저를 사용해 주세요.");
    return;
  }
  try {
    startRange.disabled = false;
    endRange.disabled = false;
    previewButton.disabled = false;
    saveButton.disabled = false;
    shareButton.disabled = false;
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const supportedType = ["audio/webm;codecs=opus", "audio/mp4", "audio/webm"]
      .find((type) => MediaRecorder.isTypeSupported(type));
    mediaRecorder = supportedType ? new MediaRecorder(stream, { mimeType: supportedType }) : new MediaRecorder(stream);
    chunks = [];
    mediaRecorder.addEventListener("dataavailable", (event) => {
      if (event.data.size) chunks.push(event.data);
    });
    mediaRecorder.addEventListener("stop", async () => {
      stream.getTracks().forEach((track) => track.stop());
      audioBlob = new Blob(chunks, { type: mediaRecorder.mimeType || "audio/webm" });
      await loadRecording(audioBlob);
    }, { once: true });
    mediaRecorder.start();
    startedAt = Date.now();
    timer.textContent = "00:00";
    setRecordingState(true);
    timerInterval = setInterval(updateTimer, 50);
  } catch (error) {
    console.error("Could not start recording:", error);
    showToast(error.name === "NotAllowedError"
      ? "마이크 권한을 허용한 뒤 다시 시도해 주세요."
      : "마이크를 시작할 수 없어요. 기기 연결을 확인해 주세요.");
  }
}

async function loadRecording(blob) {
  clearInterval(timerInterval);
  setRecordingState(false);
  timer.innerHTML = formatTime(audioBuffer?.duration || (Date.now() - startedAt) / 1000, true);
  if (audioUrl) URL.revokeObjectURL(audioUrl);
  audioUrl = URL.createObjectURL(blob);
  audioPlayer.src = audioUrl;
  try {
    audioContext ||= new AudioContext();
    audioBuffer = await audioContext.decodeAudioData(await blob.arrayBuffer());
    startRange.value = "0";
    endRange.value = "1000";
    durationLabel.textContent = formatTime(audioBuffer.duration);
    editor.classList.remove("is-empty");
    emptyEditor.hidden = true;
    editorContent.hidden = false;
    drawWaveform();
    updateSelection();
    timer.innerHTML = formatTime(audioBuffer.duration, true);
  } catch (error) {
    console.error("Could not decode recording:", error);
    showToast("녹음은 완료됐지만 이 브라우저에서 편집할 수 없어요. 아래 플레이어에서 원본을 확인해 주세요.");
    editor.classList.remove("is-empty");
    emptyEditor.hidden = true;
    editorContent.hidden = false;
    durationLabel.textContent = "편집 불가";
    startRange.disabled = true;
    endRange.disabled = true;
    previewButton.disabled = true;
    saveButton.disabled = true;
    shareButton.disabled = true;
  }
}

function drawWaveform() {
  const rect = waveform.getBoundingClientRect();
  const pixelRatio = window.devicePixelRatio || 1;
  waveform.width = Math.max(1, Math.floor(rect.width * pixelRatio));
  waveform.height = Math.max(1, Math.floor(rect.height * pixelRatio));
  const context = waveform.getContext("2d");
  context.scale(pixelRatio, pixelRatio);
  const width = rect.width;
  const height = rect.height;
  const data = audioBuffer.getChannelData(0);
  const sampleSize = Math.max(1, Math.floor(data.length / width));
  const middle = height / 2;
  context.fillStyle = "#71a27a";
  for (let x = 0; x < width; x += 1) {
    let peak = 0;
    const start = x * sampleSize;
    for (let i = start; i < Math.min(start + sampleSize, data.length); i += 1) {
      peak = Math.max(peak, Math.abs(data[i]));
    }
    const barHeight = Math.max(2, peak * (height * 0.78));
    context.globalAlpha = 0.45 + Math.min(peak, 0.6);
    context.fillRect(x, middle - barHeight / 2, 1.4, barHeight);
  }
  context.globalAlpha = 1;
}

function selectedTimes() {
  const duration = audioBuffer.duration;
  return {
    start: (Number(startRange.value) / 1000) * duration,
    end: (Number(endRange.value) / 1000) * duration
  };
}

function updateSelection() {
  const { start, end } = selectedTimes();
  startTime.textContent = formatTime(start);
  endTime.textContent = formatTime(end);
  selectionLine.style.left = `${Number(startRange.value) / 10}%`;
  selectionLine.style.right = `${100 - Number(endRange.value) / 10}%`;
}

function createTrimmedBuffer() {
  const { start, end } = selectedTimes();
  const startSample = Math.floor(start * audioBuffer.sampleRate);
  const endSample = Math.max(startSample + 1, Math.floor(end * audioBuffer.sampleRate));
  const trimmed = audioContext.createBuffer(audioBuffer.numberOfChannels, endSample - startSample, audioBuffer.sampleRate);
  for (let channel = 0; channel < audioBuffer.numberOfChannels; channel += 1) {
    trimmed.copyToChannel(audioBuffer.getChannelData(channel).slice(startSample, endSample), channel);
  }
  return trimmed;
}

function encodeWav(buffer) {
  const channelCount = buffer.numberOfChannels;
  const bytesPerSample = 2;
  const dataLength = buffer.length * channelCount * bytesPerSample;
  const output = new ArrayBuffer(44 + dataLength);
  const view = new DataView(output);
  const writeString = (offset, value) => {
    for (let i = 0; i < value.length; i += 1) view.setUint8(offset + i, value.charCodeAt(i));
  };
  writeString(0, "RIFF");
  view.setUint32(4, 36 + dataLength, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channelCount, true);
  view.setUint32(24, buffer.sampleRate, true);
  view.setUint32(28, buffer.sampleRate * channelCount * bytesPerSample, true);
  view.setUint16(32, channelCount * bytesPerSample, true);
  view.setUint16(34, bytesPerSample * 8, true);
  writeString(36, "data");
  view.setUint32(40, dataLength, true);
  let offset = 44;
  for (let i = 0; i < buffer.length; i += 1) {
    for (let channel = 0; channel < channelCount; channel += 1) {
      const sample = Math.max(-1, Math.min(1, buffer.getChannelData(channel)[i]));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += bytesPerSample;
    }
  }
  return new Blob([output], { type: "audio/wav" });
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

startRange.addEventListener("input", () => {
  if (Number(startRange.value) >= Number(endRange.value)) startRange.value = String(Number(endRange.value) - 1);
  updateSelection();
});
endRange.addEventListener("input", () => {
  if (Number(endRange.value) <= Number(startRange.value)) endRange.value = String(Number(startRange.value) + 1);
  updateSelection();
});

recordButton.addEventListener("click", startRecording);
stopButton.addEventListener("click", () => {
  if (!mediaRecorder || mediaRecorder.state !== "recording") return;
  mediaRecorder.stop();
  clearInterval(timerInterval);
  recordButton.disabled = false;
  stopButton.disabled = true;
  statusText.textContent = "저장 중";
  recorderHint.textContent = "녹음을 정리하고 있어요";
});

previewButton.addEventListener("click", async () => {
  if (!audioBuffer) return;
  if (previewing) {
    sourceNode.stop();
    previewing = false;
    previewButton.innerHTML = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="m7 4 9 6-9 6V4Z"></path></svg>구간 미리듣기';
    return;
  }
  try {
    await audioContext.resume();
    sourceNode = audioContext.createBufferSource();
    sourceNode.buffer = audioBuffer;
    sourceNode.connect(audioContext.destination);
    const { start, end } = selectedTimes();
    sourceNode.start(0, start, end - start);
    sourceNode.addEventListener("ended", () => {
      previewing = false;
      previewButton.innerHTML = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="m7 4 9 6-9 6V4Z"></path></svg>구간 미리듣기';
    }, { once: true });
    previewing = true;
    previewButton.innerHTML = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 5h10v10H5z"></path></svg>미리듣기 중지';
  } catch (error) {
    console.error("Could not preview selection:", error);
    showToast("미리듣기를 시작할 수 없어요.");
  }
});

saveButton.addEventListener("click", () => {
  if (!audioBuffer) return;
  downloadBlob(encodeWav(createTrimmedBuffer()), "soridam-edited.wav");
  showToast("편집한 녹음을 WAV 파일로 저장했어요.");
});

shareButton.addEventListener("click", async () => {
  if (!audioBuffer) return;
  const blob = encodeWav(createTrimmedBuffer());
  const file = new File([blob], "soridam-recording.wav", { type: "audio/wav" });
  if (navigator.canShare?.({ files: [file] }) && navigator.share) {
    try {
      await navigator.share({ files: [file], title: "소리담 녹음", text: "녹음 파일을 공유합니다." });
    } catch (error) {
      if (error.name !== "AbortError") {
        console.error("Could not share recording:", error);
        showToast("공유를 열지 못했어요. 편집본 저장 후 파일을 첨부해 주세요.");
      }
    }
    return;
  }
  downloadBlob(blob, "soridam-recording.wav");
  showToast("공유 파일을 저장했어요. 카카오톡이나 문자에 파일을 첨부해 보내세요.");
});

window.addEventListener("resize", () => {
  if (audioBuffer && !editorContent.hidden) drawWaveform();
});

window.addEventListener("beforeunload", () => {
  if (audioUrl) URL.revokeObjectURL(audioUrl);
});
