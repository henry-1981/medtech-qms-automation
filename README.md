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