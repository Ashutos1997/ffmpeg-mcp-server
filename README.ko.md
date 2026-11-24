# ffmpeg-mcp-server

[English](README.md) | [한국어](README.ko.md)

[![CI](https://github.com/Ashutos1997/ffmpeg-mcp-server/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/Ashutos1997/ffmpeg-mcp-server/actions) [![Release](https://img.shields.io/github/v/release/Ashutos1997/ffmpeg-mcp-server?color=blue&label=release)](https://github.com/Ashutos1997/ffmpeg-mcp-server/releases) [![License: MIT](https://img.shields.io/badge/License-MIT-emerald.svg)](LICENSE) [![npm version](https://img.shields.io/npm/v/@ash_j1997/ffmpeg-mcp-server.svg)](https://www.npmjs.com/package/@ash_j1997/ffmpeg-mcp-server) [![npm downloads](https://img.shields.io/npm/dw/@ash_j1997/ffmpeg-mcp-server.svg)](https://www.npmjs.com/package/@ash_j1997/ffmpeg-mcp-server) [![npm total downloads](https://img.shields.io/npm/dt/@ash_j1997/ffmpeg-mcp-server.svg)](https://www.npmjs.com/package/@ash_j1997/ffmpeg-mcp-server) [![Ashutos1997/ffmpeg-mcp-server MCP server](https://glama.ai/mcp/servers/Ashutos1997/ffmpeg-mcp-server/badges/score.svg)](https://glama.ai/mcp/servers/Ashutos1997/ffmpeg-mcp-server) [![FFmpeg MCP server](https://mcprush.com/badge/ashutos1997-ffmpeg-mcp/card.svg)](https://mcprush.com/to/ashutos1997-ffmpeg-mcp?ref=badge)

AI 에이전트와 도구가 로컬에서 비디오 및 오디오를 처리할 수 있도록 FFmpeg 및 FFprobe 기능을 제공하는 Model Context Protocol (MCP) 서버입니다.

크로스 플랫폼 GPU 하드웨어 가속(Apple Silicon VideoToolbox, NVIDIA NVENC, Intel QuickSync, AMD AMF), MCP 진행률 토큰을 통한 실시간 진행 상황 보고, `AbortSignal` 기반의 즉각적인 작업 취소, 사후 자체 검증(`verified`), 사전 계획 검증(`dryRun`), 멀티모달 비전 모델을 위한 이미지 프리뷰 인라인 반환을 완벽하게 지원합니다.

---

## ⚡ 1-명령어 자동 클라이언트 설정 (Automated Client Setup)

터미널에서 명령어 한 줄로 Claude Desktop, Cursor, Antigravity, Claude Code를 자동으로 감지하고 설정할 수 있습니다:

```bash
npx @ash_j1997/ffmpeg-mcp-server setup
```

마법사가 클라이언트의 설정 파일 경로를 찾아 기존 MCP 서버 설정을 안전하게 보존하면서 `@ash_j1997/ffmpeg-mcp-server`를 등록하여 즉시 20개 스튜디오 도구를 활성화합니다.

---

## 개발 배경 (Why This Exists)

AI 에이전트에게 영상 처리를 직접 명령하면 잘못된 플래그, 문법 오류, 지원되지 않는 픽셀 포맷 등을 만들어내어 작업이 실패하기 쉽습니다.

본 서버는 Zod 스키마로 정의된 **20가지 타입 안전한 도구(Typed Tools)**를 제공합니다. AI가 `{ inputPath: "video.mov", preset: "instagram_reel" }`와 같은 구조화된 매개변수를 전달하면, 서버가 유효한 FFmpeg 명령어를 로컬에서 직접 실행하며 안정적인 에러 처리, 사후 자동 검증, 하드웨어 가속 및 진행률 알림을 수행합니다.

---

## 빠른 시작 (수동 설정)

별도의 빌드나 클론 없이 클라이언트 설정 파일에 바로 추가하여 실행할 수 있습니다:

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

* **Claude Desktop:** `~/Library/Application Support/Claude/claude_desktop_config.json` (Mac) 또는 `%APPDATA%\Claude\claude_desktop_config.json` (Windows)
* **Cursor / Windsurf:** stdio 서버로 등록 (Command: `npx`, Args: `["-y", "@ash_j1997/ffmpeg-mcp-server"]`)
* **Antigravity:** `~/.gemini/config/mcp_config.json`

---

## 주요 기능 (Key Features)

* **범용 하드웨어 가속:** macOS(VideoToolbox), Linux/Windows GPU(NVIDIA NVENC, Intel QuickSync, AMD AMF, VA-API)를 자동 감지하여 낮은 CPU 점유율로 5배~20배 빠른 인코딩을 지원합니다.
* **사후 자체 검증(Post-Flight Self-Verification):** 주요 편집 도구(`media_convert`, `trim_media`, `compress_video`, `reformat_aspect_ratio`, `concat_media`, `normalize_audio`, `extract_audio`)가 생성된 출력 파일을 자동으로 ffprobe로 재검사하여 확인된 용량, 재생시간, 코덱, 해상도를 에이전트에게 반환합니다.
* **사전 계획 검증(`dryRun`):** 무거운 인코딩 도구에 `dryRun: true`를 전달하면 실제 파일 작성 없이 생성될 FFmpeg 명령어, 필터그래프, 예상 용량을 미리 검사할 수 있습니다.
* **실시간 진행률 보고:** 표준 MCP 진행률 토큰(`notifications/progress`)을 통해 실시간 백분율(%)을 전송하여 클라이언트 UI에 진행 바를 표시합니다.
* **즉각적인 작업 취소:** 클라이언트의 `AbortSignal` 이벤트를 감지하여 사용자가 생성을 중단하면 실행 중인 하위 FFmpeg 프로세스를 즉시 종료합니다.
* **멀티모달 비전 모델용 프리뷰:** 썸네일, 오디오 파형, 멀티 프레임 콘택트 시트를 base64 이미지 데이터로 인라인 반환하여 Claude 3.7, GPT-4o, Gemini 등의 비전 모델이 미디어를 직접 "볼" 수 있습니다.
* **숏폼/소셜 포맷 자동화:** 가로 영상을 배경 블러 처리된 9:16 세로 숏폼 영상으로 변환하고, 스타일이 적용된 자막을 하드코딩(버닝)하며, 틱톡/릴스/유튜브 쇼츠 전용 프리셋을 제공합니다.
* **오디오 엔지니어링:** 스트리밍/방송 표준(EBU R128 / -16 LUFS)에 맞춰 음량을 정규화하고, 80Hz 럼블 제거 필터로 음성을 선명하게 보정하며, 립싱크를 유지하면서 무음 구간을 자동으로 잘라냅니다.
* **장면 감지 및 스트림 결합:** 시각적 장면 전환(컷 편집 지점)을 감지하여 타임스탬프와 콘택트 시트를 반환하고, 무손실 스트림 복사로 비디오와 오디오를 즉시 결합/교체합니다.
* **지능형 사전 검증(Smart Input Guards):** FFmpeg 실행 전 미디어 스트림 유무, 오디오 트랙, 재생 시간 한계를 사전에 검증하여 런타임 오류를 방지합니다.

---

## 제공 도구 목록 (총 20개)

| 도구명 | 설명 | 주요 매개변수 |
| :--- | :--- | :--- |
| **`ffmpeg_doctor`** *(신규)* | FFmpeg/FFprobe 바이너리 경로, 하드웨어 가속, 오디오/비디오 코덱, 필수 필터(`libass`, `loudnorm`) 환경을 진단하고 해결 가이드를 제공합니다. | `checkFilters` |
| **`media_probe`** | ffprobe로 미디어 파일을 검사하여 메타데이터, 스트림, 코덱, 해상도, 재생 시간을 JSON으로 반환합니다. | `inputPath` |
| **`media_convert`** | 비디오 및 오디오 포맷을 변환합니다. 웹용 MP4, WebM, GIF, 인스타그램 릴스(9:16), 유튜브 쇼츠(9:16) 프리셋 및 `dryRun`을 지원합니다. | `inputPath`, `outputPath`, `preset`, `crf`, `resolution`, `fps`, `hardwareAcceleration`, `dryRun` |
| **`trim_media`** | 스트림 복사(무손실/초고속) 또는 재인코딩 방식으로 비디오/오디오의 특정 구간을 자릅니다 (`dryRun` 지원). | `inputPath`, `outputPath`, `startTime`, `endTime`, `duration`, `accurateReencode`, `dryRun` |
| **`extract_audio`** | 비디오에서 오디오 트랙을 추출합니다. Whisper 음성 인식에 최적화된 16kHz 모노 WAV 프리셋을 포함합니다. | `inputPath`, `outputPath`, `format`, `bitrate` |
| **`extract_thumbnail`** | 특정 타임스탬프 또는 중간 지점의 스틸 컷을 캡처합니다. 비전 모델을 위해 base64 이미지 데이터를 함께 반환할 수 있습니다. | `inputPath`, `outputPath`, `timestamp`, `resolution`, `includeBase64` |
| **`compress_video`** | 대상 크기(예: GitHub PR용 10MB 미만, Discord용 25MB 미만)에 맞게 비디오를 압축합니다 (`dryRun` 지원). | `inputPath`, `outputPath`, `targetSizeMB`, `preset`, `crf`, `maxWidth`, `hardwareAcceleration`, `dryRun` |
| **`reformat_aspect_ratio`** | 배경 블러 패딩 또는 중앙 크롭을 적용해 영상 비율을 9:16(세로), 1:1(정사각형), 4:5(포트레이트)로 변환합니다. | `inputPath`, `outputPath`, `targetRatio`, `mode`, `blurAmount`, `padColor`, `hardwareAcceleration`, `dryRun` |
| **`create_split_screen`** | 두 개의 영상을 상하(9:16 숏폼/릴스) 또는 좌우로 배치하고 오디오 믹싱 및 자막을 합성합니다. | `firstVideoPath`, `secondVideoPath`, `outputPath`, `layout`, `audioSource`, `subtitlesPath` |
| **`trim_silence`** | 영상과 음성의 립싱크를 완벽히 유지하면서 녹음/녹화 영상의 무음 구간(침묵)을 감지해 자동으로 잘라냅니다. | `inputPath`, `outputPath`, `mode`, `thresholdDb`, `minDurationSeconds` |
| **`concat_media`** | 여러 미디어 파일을 순서대로 병합합니다. 입력 파일을 자동 분석하여 스트림 복사 또는 재인코딩을 선택합니다. | `inputPaths`, `outputPath`, `mode`, `dryRun` |
| **`generate_waveform`** | 오디오 파형(Waveform) PNG 이미지를 생성합니다. 비전 모델을 위한 base64 데이터를 반환할 수 있습니다. | `inputPath`, `outputPath`, `width`, `height`, `color`, `scale`, `includeBase64` |
| **`add_subtitles`** | 비디오 재인코딩 없이 SRT 또는 VTT 자막 트랙을 MP4/MKV 파일에 소프트웨어 자막으로 삽입합니다. | `videoPath`, `subtitlesPath`, `outputPath`, `language`, `title` |
| **`burn_subtitles`** | 폰트 크기, 글자 색상, 외곽선, 여백을 커스텀하여 비디오 프레임에 자막을 직접 하드코딩(버닝)합니다. | `videoPath`, `subtitlesPath`, `outputPath`, `fontSize`, `fontColor`, `outlineColor`, `marginV` |
| **`extract_keyframes`** | 영상 전반에 걸쳐 대표 키프레임을 추출하고 비전 AI가 한눈에 볼 수 있는 그리드형 콘택트 시트를 생성합니다. | `inputPath`, `outputPath`, `count`, `layout`, `includeBase64` |
| **`normalize_audio`** | EBU R128 표준(기본 -16 LUFS)을 적용해 오디오 음량을 균일하게 정규화하고 80Hz 고역 통과 필터로 음성을 선명하게 다듬습니다. | `inputPath`, `outputPath`, `targetLufs`, `targetPeakDb`, `voiceClarity` |
| **`add_overlay`** | 워터마크 이미지나 로고 PNG를 영상 모서리에 오버레이하며 위치, 여백, 크기 비율, 투명도를 조절할 수 있습니다. | `videoPath`, `overlayPath`, `outputPath`, `position`, `padding`, `scaleWidth`, `opacity` |
| **`change_speed`** | 피치(음높이) 왜곡 없이 재생 속도를 배속(2배속 고속, 0.5배속 슬로우 모션 등)으로 조절합니다. | `inputPath`, `outputPath`, `speed`, `muteAudio` |
| **`mux_media`** | 비디오와 오디오 스트림을 결합하거나 교체(더빙/음악 삽입)합니다. 오디오 지연 오프셋 및 무손실 스트림 복사를 지원합니다. | `videoPath`, `audioPath`, `outputPath`, `mode`, `audioOffsetSeconds`, `streamCopyVideo`, `shortest` |
| **`detect_scenes`** | 비디오의 장면 전환 및 컷 편집 지점을 감지합니다. 타임스탬프, 구간별 재생 시간, 콘택트 시트 프리뷰를 JSON 및 이미지로 반환합니다. | `inputPath`, `threshold`, `minDurationSeconds`, `outputPath`, `includeBase64` |

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

## 로컬 개발 및 테스트

1. **의존성 설치:**
   ```bash
   npm install
   ```

2. **빌드 및 22개 전체 테스트 스위트 실행:**
   ```bash
   npm test
   ```

---

## 기여 및 커뮤니티 (Acknowledgements)

- [@rajarshidattapy](https://github.com/rajarshidattapy)님께 스트림 멀티플렉싱(`mux_media`)과 장면 전환 감지(`detect_scenes`) 제안에 감사드립니다.
- Reddit 사용자 [u/QuanTradin](https://www.reddit.com/user/QuanTradin/)님께 사전 검증(Smart Input Guards) 및 `concat_media` 자동 분석 제안에 감사드립니다.

---

## 라이선스 (License)

MIT © [Ashutos1997](https://github.com/Ashutos1997)
