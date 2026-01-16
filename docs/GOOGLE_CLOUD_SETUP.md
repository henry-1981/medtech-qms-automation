# Google Cloud Console 설정 가이드

MedTech QMS Automation 앱에서 Google Drive 및 Sheets 연동을 위한 설정 가이드입니다.

## 목차

1. [Google Cloud 프로젝트 생성](#1-google-cloud-프로젝트-생성)
2. [API 활성화](#2-api-활성화)
3. [OAuth 동의 화면 설정](#3-oauth-동의-화면-설정)
4. [OAuth 클라이언트 ID 생성](#4-oauth-클라이언트-id-생성)
5. [Gemini API 키 발급](#5-gemini-api-키-발급)
6. [환경 변수 설정](#6-환경-변수-설정)
7. [Google Drive 폴더 구조](#7-google-drive-폴더-구조)

---

## 1. Google Cloud 프로젝트 생성

1. [Google Cloud Console](https://console.cloud.google.com/) 접속
2. 상단의 프로젝트 선택 드롭다운 클릭
3. **새 프로젝트** 클릭
4. 프로젝트 이름 입력 (예: `medtech-qms-automation`)
5. **만들기** 클릭

---

## 2. API 활성화

생성한 프로젝트에서 다음 API를 활성화해야 합니다:

1. [API 및 서비스 > 라이브러리](https://console.cloud.google.com/apis/library) 이동
2. 다음 API 검색 후 **사용 설정** 클릭:

| API 이름 | 용도 |
|----------|------|
| **Google Drive API** | SOP 문서 읽기/다운로드 |
| **Google Sheets API** | 릴리스/V&V 시트 연동 |

---

## 3. OAuth 동의 화면 설정

1. [API 및 서비스 > OAuth 동의 화면](https://console.cloud.google.com/apis/credentials/consent) 이동
2. **User Type** 선택:
   - 개인/소규모 팀: **외부** 선택
   - 조직 내부 전용: **내부** 선택 (Google Workspace 필요)
3. **만들기** 클릭

### 앱 정보 입력

| 필드 | 값 |
|------|-----|
| 앱 이름 | MedTech QMS Automation |
| 사용자 지원 이메일 | 본인 이메일 |
| 개발자 연락처 정보 | 본인 이메일 |

4. **저장 후 계속** 클릭

### 범위 설정

1. **범위 추가 또는 삭제** 클릭
2. 다음 범위 선택:
   - `https://www.googleapis.com/auth/drive` (Google Drive 전체 액세스)
   - `https://www.googleapis.com/auth/spreadsheets` (Google Sheets 전체 액세스)
3. **업데이트** 클릭
4. **저장 후 계속** 클릭

### 테스트 사용자 추가 (외부 타입 선택 시)

1. **ADD USERS** 클릭
2. 앱을 사용할 Google 계정 이메일 추가
3. **저장 후 계속** 클릭

---

## 4. OAuth 클라이언트 ID 생성

1. [API 및 서비스 > 사용자 인증 정보](https://console.cloud.google.com/apis/credentials) 이동
2. **+ 사용자 인증 정보 만들기** > **OAuth 클라이언트 ID** 클릭

### 클라이언트 설정

| 필드 | 값 |
|------|-----|
| 애플리케이션 유형 | **데스크톱 앱** |
| 이름 | MedTech QMS Desktop |

3. **만들기** 클릭

### 인증 정보 복사

생성 완료 후 표시되는 정보를 안전하게 저장:

```
클라이언트 ID: xxxxxxxxxxxx.apps.googleusercontent.com
클라이언트 보안 비밀번호: GOCSPX-xxxxxxxxxxxxxxxx
```

---

## 5. Gemini API 키 발급

LLM 및 임베딩 기능을 위해 Gemini API 키가 필요합니다.

1. [Google AI Studio](https://aistudio.google.com/apikey) 접속
2. **Create API Key** 클릭
3. 프로젝트 선택 (위에서 생성한 프로젝트)
4. 생성된 API 키 복사

```
API Key: AIzaSyxxxxxxxxxxxxxxxxxxxxxxxxx
```

---

## 6. 환경 변수 설정

프로젝트 루트에서 `.env` 파일 생성:

```bash
cp .env.example .env
```

`.env` 파일 편집:

```env
# Google AI (Gemini)
GOOGLE_API_KEY=AIzaSyxxxxxxxxxxxxxxxxxxxxxxxxx

# Google OAuth 2.0
GOOGLE_CLIENT_ID=xxxxxxxxxxxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-xxxxxxxxxxxxxxxx

# Google Drive 폴더명 (본인 Drive 구조에 맞게 수정)
DRIVE_QMS_ROOT_FOLDER=QMS_ROOT
DRIVE_SOP_FOLDER=01_SOPs
```

---

## 7. Google Drive 폴더 구조

앱에서 SOP 문서를 읽으려면 Google Drive에 다음 구조가 필요합니다:

```
내 드라이브/
└── QMS_ROOT/                    ← DRIVE_QMS_ROOT_FOLDER
    └── 01_SOPs/                 ← DRIVE_SOP_FOLDER
        ├── SOP-001_설계변경관리.docx
        ├── SOP-002_문서관리.docx
        ├── SOP-003_위험관리.pdf
        └── ...
```

### 폴더 이름 변경

기존 폴더 구조가 다르다면 `.env`에서 폴더명을 수정하세요:

```env
# 예: 기존 폴더가 "QMS문서/SOP" 구조인 경우
DRIVE_QMS_ROOT_FOLDER=QMS문서
DRIVE_SOP_FOLDER=SOP
```

---

## 문제 해결

### OAuth 오류: "앱이 확인되지 않음"

- **외부** 타입에서 테스트 사용자로 등록되지 않은 계정 사용 시 발생
- 해결: OAuth 동의 화면 > 테스트 사용자에 본인 이메일 추가

### API 오류: "Drive API has not been enabled"

- Drive API가 활성화되지 않음
- 해결: [API 라이브러리](https://console.cloud.google.com/apis/library)에서 Drive API 활성화

### 연결 시간 초과

- OAuth 콜백 서버(localhost:3000)가 다른 프로세스에 의해 사용 중
- 해결: 3000번 포트를 사용하는 프로세스 종료 후 재시도

---

## 보안 주의사항

1. **`.env` 파일은 절대 Git에 커밋하지 마세요** (`.gitignore`에 포함됨)
2. API 키와 클라이언트 비밀번호는 안전하게 보관
3. 프로덕션 환경에서는 OAuth 앱을 **게시** 상태로 전환 필요
