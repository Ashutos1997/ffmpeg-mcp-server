# ffmpeg-mcp-server

[English](README.md) | [한국어](README.ko.md)

[![CI](https://github.com/Ashutos1997/ffmpeg-mcp-server/actions/workflows/ci.yml/badge.svg)](https://github.com/Ashutos1997/ffmpeg-mcp-server/actions) [![Release](https://img.shields.io/github/v/release/Ashutos1997/ffmpeg-mcp-server?color=blue)](https://github.com/Ashutos1997/ffmpeg-mcp-server/releases) [![License: MIT](https://img.shields.io/badge/License-MIT-emerald.svg)](LICENSE) [![npm version](https://img.shields.io/npm/v/@ash_j1997/ffmpeg-mcp-server.svg)](https://www.npmjs.com/package/@ash_j1997/ffmpeg-mcp-server) [![npm downloads](https://img.shields.io/npm/dw/@ash_j1997/ffmpeg-mcp-server.svg)](https://www.npmjs.com/package/@ash_j1997/ffmpeg-mcp-server) [![npm total downloads](https://img.shields.io/npm/dt/@ash_j1997/ffmpeg-mcp-server.svg)](https://www.npmjs.com/package/@ash_j1997/ffmpeg-mcp-server) [![Glama](https://glama.ai/mcp/servers/@Ashutos1997/ffmpeg-mcp-server/badge)](https://glama.ai/mcp/servers/@Ashutos1997/ffmpeg-mcp-server) [![FFmpeg MCP server](https://mcprush.com/badge/ashutos1997-ffmpeg-mcp/card.svg)](https://mcprush.com/to/ashutos1997-ffmpeg-mcp?ref=badge)

AI 에이전트와 도구가 로컬에서 비디오 및 오디오를 처리할 수 있도록 FFmpeg 및 FFprobe 기능을 제공하는 Model Context Protocol (MCP) 서버입니다.

크로스 플랫폼 GPU 하드웨어 가속(Apple Silicon VideoToolbox, NVIDIA NVENC, Intel QuickSync, AMD AMF), MCP 진행률 토큰을 통한 실시간 진행 상황 보고, `AbortSignal` 기반의 즉각적인 작업 취소, 멀티모달 비전 모델을 위한 이미지 프리뷰 인라인 반환을 완벽하게 지원합니다.

---

## 개발 배경 (Why This Exists)

AI 에이전트에게 영상 처리를 직접 명령하면 잘못된 플래그, 문법 오류, 지원되지 않는 픽셀 포맷 등을 만들어내어 작업이 실패하기 쉽습니다.

본 서버는 Zod 스키마로 정의된 **17가지 타입 안전한 도구(Typed Tools)**를 제공합니다. AI가 `{ inputPath: "video.mov", preset: "web_mp4" }`와 같은 구조화된 매개변수를 전달하면, 서버가 유효한 FFmpeg 명령어를 로컬에서 직접 실행하며 안정적인 에러 처리, 하드웨어 가속 및 진행률 알림을 수행합니다.

---

## 주요 기능 (Key Features)

* **범용 하드웨어 가속:** macOS(VideoToolbox), Linux/Windows GPU(NVIDIA NVENC, Intel QuickSync, AMD AMF, VA-API)를 자동 감지하여 낮은 CPU 점유율로 5배~20배 빠른 인코딩을 지원합니다.
* **실시간 진행률 보고:** 표준 MCP 진행률 토큰(`notifications/progress`)을 통해 실시간 백분율(%)을 전송하여 클라이언트 UI에 진행 바를 표시합니다.
* **즉각적인 작업 취소:** 클라이언트의 `AbortSignal` 이벤트를 감지하여 사용자가 생성을 중단하면 실행 중인 하위 FFmpeg 프로세스를 즉시 종료합니다.
* **멀티모달 비전 모델용 프리뷰:** 썸네일, 오디오 파형, 멀티 프레임 콘택트 시트를 base64 이미지 데이터로 인라인 반환하여 Claude 3.7, GPT-4o, Gemini 등의 비전 모델이 미디어를 직접 "볼" 수 있습니다.
* **숏폼/소셜 포맷 자동화:** 가로 영상을 배경 블러 처리된 9:16 세로 숏폼 영상으로 변환하고, 스타일이 적용된 자막을 하드코딩(버닝)하며, 틱톡/릴스용 상하 분할 스플릿 스크린 영상을 제작합니다.
* **오디오 엔지니어링:** 스트리밍/방송 표준(EBU R128 / -16 LUFS)에 맞춰 음량을 정규화하고, 80Hz 럼블 제거 필터로 음성을 선명하게 보정하며, 립싱크를 유지하면서 무음 구간을 자동으로 잘라냅니다.

---

## 제공 도구 목록 (총 17개)

| 도구명 | 설명 | 주요 매개변수 |
| :--- | :--- | :--- |
| **`media_probe`** | ffprobe로 미디어 파일을 검사하여 메타데이터, 스트림, 코덱, 해상도, 재생 시간을 JSON으로 반환합니다. | `inputPath` |
| **`media_convert`** | 비디오 및 오디오 포맷을 변환합니다. 웹용 MP4, WebM, 애니메이션 GIF 프리셋 및 GPU 가속을 지원합니다. | `inputPath`, `outputPath`, `preset`, `crf`, `resolution`, `fps`, `hardwareAcceleration` |
| **`trim_media`** | 스트림 복사(무손실/초고속) 또는 재인코딩 방식으로 비디오/오디오의 특정 구간을 자릅니다. | `inputPath`, `outputPath`, `startTime`, `endTime`, `duration`, `accurateReencode` |
| **`extract_audio`** | 비디오에서 오디오 트랙을 추출합니다. Whisper 음성 인식에 최적화된 16kHz 모노 WAV 프리셋을 포함합니다. | `inputPath`, `outputPath`, `format`, `bitrate` |
| **`extract_thumbnail`** | 특정 타임스탬프 또는 중간 지점의 스틸 컷을 캡처합니다. 비전 모델을 위해 base64 이미지 데이터를 함께 반환할 수 있습니다. | `inputPath`, `outputPath`, `timestamp`, `resolution`, `includeBase64` |
| **`compress_video`** | 대상 크기(예: GitHub PR용 10MB 미만, Discord용 25MB 미만)에 맞게 비디오를 압축합니다. | `inputPath`, `outputPath`, `targetSizeMB`, `preset`, `crf`, `maxWidth`, `hardwareAcceleration` |
| **`reformat_aspect_ratio`** | 배경 블러 패딩 또는 중앙 크롭을 적용해 영상 비율을 9:16(세로), 1:1(정사각형), 4:5(포트레이트)로 변환합니다. | `inputPath`, `outputPath`, `targetRatio`, `mode`, `blurAmount`, `padColor`, `hardwareAcceleration` |
| **`create_split_screen`** | 두 개의 영상을 상하(9:16 숏폼/릴스) 또는 좌우로 배치하고 오디오 믹싱 및 자막을 합성합니다. | `firstVideoPath`, `secondVideoPath`, `outputPath`, `layout`, `audioSource`, `subtitlesPath` |
| **`trim_silence`** | 영상과 음성의 립싱크를 완벽히 유지하면서 녹음/녹화 영상의 무음 구간(침묵)을 감지해 자동으로 잘라냅니다. | `inputPath`, `outputPath`, `mode`, `thresholdDb`, `minDurationSeconds` |
| **`concat_media`** | 여러 비디오 또는 오디오 파일을 순서대로 병합합니다. 스트림 복사 및 재인코딩 방식을 지원합니다. | `inputPaths`, `outputPath`, `mode` |
| **`generate_waveform`** | 오디오 파형(Waveform) PNG 이미지를 생성합니다. 비전 모델을 위한 base64 데이터를 반환할 수 있습니다. | `inputPath`, `outputPath`, `width`, `height`, `color`, `scale`, `includeBase64` |
| **`add_subtitles`** | 비디오 재인코딩 없이 SRT 또는 VTT 자막 트랙을 MP4/MKV 파일에 소프트웨어 자막으로 삽입합니다. | `videoPath`, `subtitlesPath`, `outputPath`, `language`, `title` |
| **`burn_subtitles`** *(신규)* | 폰트 크기, 글자 색상, 외곽선, 여백을 커스텀하여 비디오 프레임에 자막을 직접 하드코딩(버닝)합니다. | `videoPath`, `subtitlesPath`, `outputPath`, `fontSize`, `fontColor`, `outlineColor`, `marginV` |
| **`extract_keyframes`** *(신규)* | 영상 전반에 걸쳐 대표 키프레임을 추출하고 비전 AI가 한눈에 볼 수 있는 그리드형 콘택트 시트를 생성합니다. | `inputPath`, `outputPath`, `count`, `layout`, `includeBase64` |
| **`normalize_audio`** *(신규)* | EBU R128 표준(기본 -16 LUFS)을 적용해 오디오 음량을 균일하게 정규화하고 80Hz 고역 통과 필터로 음성을 선명하게 다듬습니다. | `inputPath`, `outputPath`, `targetLufs`, `targetPeakDb`, `voiceClarity` |
| **`add_overlay`** *(신규)* | 워터마크 이미지나 로고 PNG를 영상 모서리에 오버레이하며 위치, 여백, 크기 비율, 투명도를 조절할 수 있습니다. | `videoPath`, `overlayPath`, `outputPath`, `position`, `padding`, `scaleWidth`, `opacity` |
| **`change_speed`** | 피치(음높이) 왜곡 없이 재생 속도를 배속(2배속 고속, 0.5배속 슬로우 모션 등)으로 조절합니다. | `inputPath`, `outputPath`, `speed`, `muteAudio` |

---

## MCP 리소스 및 프롬프트 (Resources & Prompts)

### 리소스 (Resources)
* **`media://capabilities`**: 로컬 FFmpeg 설치 상태, 버전, 감지된 하드웨어 가속기(VideoToolbox, NVENC, QSV, AMF, VAAPI) 및 지원 비디오 인코더를 조회합니다.
* **`media://presets`**: 소셜 미디어 종횡비, 플랫폼별 업로드 용량 제한, 방송 음량 타깃 기준표를 제공합니다.

### 프롬프트 (Prompts)
* **`social_clip_generator`**: 원본 가로 영상을 블러 패딩, 무음 구간 편집, 자막 버닝이 적용된 세로형 숏폼 클립으로 변환하는 인터랙티브 워크플로우입니다.
* **`whisper_audio_prep`**: Whisper 음성 인식 모델에 최적화된 16kHz 모노 WAV 오디오 추출 및 음량 정규화 파이프라인입니다.

---

## 요구 사항 (Requirements)

* **Node.js** >= 18.0.0
* 로컬에 **FFmpeg & FFprobe** 설치 필요:
  * **macOS:** `brew install ffmpeg`
  * **Linux (Ubuntu/Debian):** `sudo apt update && sudo apt install ffmpeg libass-dev`
  * **Windows:** `winget install Gyan.FFmpeg` 또는 `choco install ffmpeg`

---

## 설치 및 설정 (Installation)

### 빠른 시작 (Claude Desktop, Cursor, Antigravity)

별도의 저장소 클론이나 빌드 없이 `npx`로 바로 실행할 수 있습니다:

```json
{
  "mcpServers": {
    "ffmpeg": {
      "command": "npx",
      "args": ["-y", "@ash_j1997/ffmpeg-mcp-server"]
    }
  }
}
```

#### 설정 파일 위치 안내:
* **Claude Desktop (macOS):** `~/Library/Application Support/Claude/claude_desktop_config.json`
* **Claude Desktop (Windows):** `%APPDATA%\Claude\claude_desktop_config.json`
* **Antigravity IDE:** `~/.gemini/config/mcp_config.json`
* **Cursor / Windsurf:** stdio 서버 유형 선택 후 Command: `npx`, Args: `["-y", "@ash_j1997/ffmpeg-mcp-server"]` 추가

---

## 로컬 개발 및 테스트 (Local Development)

1. **의존성 설치:**
   ```bash
   npm install
   ```

2. **빌드 및 자동화 테스트 실행:**
   ```bash
   npm test
   ```

---

## 라이선스 (License)

MIT © [Ashutos1997](https://github.com/Ashutos1997)

