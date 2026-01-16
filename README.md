# MedTech QMS Automation 🏥

AI 기반 의료기기 소프트웨어(SaMD)의 품질 관리 시스템(QMS)을 자동화하기 위한 도구입니다. 이 프로젝트는 ISO 13485 및 IEC 62304 표준을 준수하는 문서화 과정을 효율화하는 것을 목표로 합니다.

## 🚀 주요 기능
- **문서 생성 자동화**: 기술문서, 소프트웨어 개발 계획서(SDP) 등의 초안 생성
- **변경 관리 추적**: 코드 변경 내역을 QMS 변경 관리 프로세스와 연동
- **위험 관리 지원**: ISO 14971 기반의 위험 분석 데이터 정리 및 트래킹
- **컴플라이언스 체크**: 의료기기 인허가 요구사항 준수 여부 자동 검토 보조

## 🛠 기술 스택
- **Environment**: WSL2 (Ubuntu)
- **Runtime**: Node.js / Electron
- **AI Integration**: Gemini CLI, OpenCode
- **Version Control**: Git & GitHub

## 📂 프로젝트 구조
- `/src`: QMS 자동화 로직 소스 코드
- `/templates`: 의료기기 표준 문서 템플릿
- `/docs`: 생성된 QMS 문서 저장소

## ⚖️ 준수 표준
- **ISO 13485:2016**: 의료기기 품질 경영 시스템
- **IEC 62304**: 의료기기 소프트웨어 생명 주기 프로세스
- **ISO 14971**: 의료기기 위험 관리

## 👤 Author
- 박현배 (Park, Hyunbae) - AI-based SaMD Lifecycle Expert (Development, RA, Commercialization)

---

## 💻 실행 및 빌드 가이드

### 1. 환경 설정

1.  프로젝트 루트에 `.env` 파일 생성: `cp .env.example .env`
2.  `docs/GOOGLE_CLOUD_SETUP.md`를 참조하여 `.env`에 필수 Google API 키 및 클라이언트 정보를 입력합니다.
    *   **주의**: AI 기능이나 Drive/Sheets 연동 기능 없이도 앱은 실행되지만, `.env`에 유효한 정보가 없으면 해당 기능은 **비활성화(Degraded Mode)**됩니다.

### 2. 개발 모드 실행

Node.js 및 Electron 환경이 설정된 경우:
```bash
npm install
npm start
```
*   `npm start`는 TypeScript 빌드 후 Electron 앱을 실행합니다.

### 3. 배포용 빌드 (Windows)

Windows용 실행 파일(`.exe`)을 생성하려면:
```bash
npm install
npm run dist
```
*   생성된 실행 파일은 `/release` 폴더에서 찾을 수 있습니다.

### 4. 코드 검증

타입 체크 및 유닛 테스트를 실행합니다:
```bash
npm run lint
npm run test
```