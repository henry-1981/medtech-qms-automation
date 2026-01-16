import React, { useState, useEffect } from "react";
import ReactDOM from "react-dom/client";

declare global {
  interface Window {
    qmsApi: {
      login: (username: string, password: string) => Promise<any>;
      logout: (token: string) => Promise<any>;
      getCurrentUser: (token: string) => Promise<any>;
      analyzeChange: (description: string) => Promise<any>;
      runFullWorkflow: (token: string, description: string, sheetInputs?: { release?: unknown; vv?: unknown }) => Promise<any>;
      querySop: (question: string) => Promise<any>;
      connectDrive: (token: string) => Promise<any>;
      listSops: () => Promise<any>;
      learnSop: (token: string, fileId: string, fileName: string) => Promise<any>;
      learnCachedSop: (token: string, cacheId: string) => Promise<any>;
      getRagStatus: () => Promise<any>;
      getSchedulerStatus: () => Promise<any>;
      signWorkflow: (token: string, requestId: string, meaning: string) => Promise<any>;
      listUsers: (token: string) => Promise<any>;
      createUser: (token: string, username: string, password: string, role: string) => Promise<any>;
      listHistory: (token: string) => Promise<any>;
      listSecurityEvents: (token: string) => Promise<any>;
      getWorkflowLogs: (token: string, requestId: string) => Promise<any>;
      changePassword: (token: string, currentPassword: string, newPassword: string) => Promise<any>;
      listAvailableModels: () => Promise<any>;
      getCurrentModels: () => Promise<any>;
      onDriveStatus: (
        callback: (status: { connected: boolean; error?: string }) => void
      ) => () => void;
      onWorkflowUpdate: (
        callback: (update: {
          requestId: string;
          phase: string;
          message: string;
        }) => void
      ) => () => void;
    };
  }
}

interface FileItem {
  id: string;
  name?: string;
  fileName?: string;
  mimeType?: string;
}

interface RagStatus {
  initialized: boolean;
  documentCount: number;
  maxChunks: number;
}

interface WorkflowLog {
  timestamp: string;
  phase: string;
  message: string;
}

interface UserRecord {
  id: string;
  username: string;
  role: string;
  createdAt: string;
}

interface WorkflowHistory {
  requestId: string;
  description: string;
  status: string;
  finalVerdict: string | null;
  createdAt: string;
  updatedAt: string;
}

interface SignatureHistory {
  requestId: string;
  userId: string;
  role: string;
  meaning: string;
  signedAt: string;
}

interface SecurityEvent {
  id: string;
  type: string;
  username?: string;
  detail?: string;
  createdAt: string;
}

interface GeminiModel {
  name: string;
  displayName: string;
  description: string;
}

interface ModelConfig {
  chatModel: string;
  embeddingModel: string;
  temperature: number;
}

const App = () => {
  const [activeTab, setActiveTab] = useState<"workflow" | "query" | "users" | "history">("workflow");

  const [changeInput, setChangeInput] = useState("");
  const [workflowResult, setWorkflowResult] = useState<any>(null);
  const [workflowLogs, setWorkflowLogs] = useState<WorkflowLog[]>([]);
  const [processing, setProcessing] = useState(false);

  const [queryInput, setQueryInput] = useState("");
  const [queryResult, setQueryResult] = useState<any>(null);
  const [querying, setQuerying] = useState(false);

  const [driveConnected, setDriveConnected] = useState(false);
  const [files, setFiles] = useState<FileItem[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [learningFile, setLearningFile] = useState<string | null>(null);
  const [offlineMode, setOfflineMode] = useState(false);
  const [ragStatus, setRagStatus] = useState<RagStatus>({
    initialized: false,
    documentCount: 0,
    maxChunks: 10000,
  });

  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<UserRecord | null>(null);
  const [loginUsername, setLoginUsername] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);

  const [passwordCurrent, setPasswordCurrent] = useState("");
  const [passwordNext, setPasswordNext] = useState("");
  const [passwordMessage, setPasswordMessage] = useState<string | null>(null);

  const [releaseInput, setReleaseInput] = useState({
    차수: "",
    릴리스버전: "",
    Submit: "",
    영향분류: "",
    QA진행상태: "",
    배포승인: "",
    상세기획: "",
    릴리즈기록: "",
  });

  const [vvInput, setVvInput] = useState({
    차수: "",
    검증기록: "",
    검증결과: "",
    검증완료일: "",
    주요테스트항목: "",
    특이사항: "",
  });

  const [users, setUsers] = useState<UserRecord[]>([]);
  const [newUserName, setNewUserName] = useState("");
  const [newUserPassword, setNewUserPassword] = useState("");
  const [newUserRole, setNewUserRole] = useState("QA");

  const [workflowHistory, setWorkflowHistory] = useState<WorkflowHistory[]>([]);
  const [signatureHistory, setSignatureHistory] = useState<SignatureHistory[]>([]);
  const [securityEvents, setSecurityEvents] = useState<SecurityEvent[]>([]);
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);
  const [historyLogs, setHistoryLogs] = useState<any[]>([]);

  const [availableChatModels, setAvailableChatModels] = useState<GeminiModel[]>([]);
  const [availableEmbeddingModels, setAvailableEmbeddingModels] = useState<GeminiModel[]>([]);
  const [currentModelConfig, setCurrentModelConfig] = useState<ModelConfig | null>(null);
  const [loadingModels, setLoadingModels] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem("qmsToken");
    if (stored) {
      setSessionToken(stored);
      window.qmsApi.getCurrentUser(stored).then(async (res) => {
        if (res.user) {
          setCurrentUser(res.user);
          await loadUsers(stored);
          await loadHistory(stored);
          await loadSecurityEvents(stored);
        } else {
          localStorage.removeItem("qmsToken");
          setSessionToken(null);
        }
      });
    }

    const cleanupDrive = window.qmsApi.onDriveStatus((status) => {
      if (status.connected) {
        setDriveConnected(true);
        refreshFiles();
      }
    });

    const cleanupWorkflow = window.qmsApi.onWorkflowUpdate((update) => {
      setWorkflowLogs((prev) => [
        ...prev,
        {
          timestamp: new Date().toLocaleTimeString(),
          phase: update.phase,
          message: update.message,
        },
      ]);
    });

    refreshRagStatus();
    refreshModelInfo();

    return () => {
      cleanupDrive();
      cleanupWorkflow();
    };
  }, []);

  const ensureLogin = async (): Promise<string | null> => {
    if (sessionToken) return sessionToken;
    setAuthError("로그인이 필요합니다.");
    return null;
  };

  const handleLogin = async () => {
    setAuthError(null);
    const result = await window.qmsApi.login(loginUsername, loginPassword);
    if (result.success && result.session?.token) {
      localStorage.setItem("qmsToken", result.session.token);
      setSessionToken(result.session.token);
      setCurrentUser(result.session.user);
      setLoginPassword("");
      await loadUsers(result.session.token);
      await loadHistory(result.session.token);
      await loadSecurityEvents(result.session.token);
      return;
    }
    setAuthError("로그인 실패: 아이디 또는 비밀번호를 확인하세요.");
  };

  const handleLogout = async () => {
    if (sessionToken) {
      await window.qmsApi.logout(sessionToken);
    }
    localStorage.removeItem("qmsToken");
    setSessionToken(null);
    setCurrentUser(null);
    setUsers([]);
    setWorkflowHistory([]);
    setSignatureHistory([]);
    setSecurityEvents([]);
    setHistoryLogs([]);
  };

  const loadUsers = async (token: string) => {
    const result = await window.qmsApi.listUsers(token);
    if (result.success) {
      setUsers(result.users || []);
    } else {
      setAuthError(result.error || "사용자 목록을 불러올 수 없습니다.");
    }
  };

  const loadHistory = async (token: string) => {
    const result = await window.qmsApi.listHistory(token);
    if (result.success) {
      setWorkflowHistory(result.workflows || []);
      setSignatureHistory(result.signatures || []);
    } else {
      setAuthError(result.error || "히스토리를 불러올 수 없습니다.");
    }
  };

  const loadSecurityEvents = async (token: string) => {
    const result = await window.qmsApi.listSecurityEvents(token);
    if (result.success) {
      setSecurityEvents(result.events || []);
    }
  };

  const handleCreateUser = async () => {
    if (!sessionToken) return;
    const result = await window.qmsApi.createUser(
      sessionToken,
      newUserName,
      newUserPassword,
      newUserRole
    );
    if (result.success) {
      setNewUserName("");
      setNewUserPassword("");
      await loadUsers(sessionToken);
    } else {
      setAuthError(result.error || "사용자 생성 실패");
    }
  };

  const handleLoadLogs = async (requestId: string) => {
    if (!sessionToken) return;
    setSelectedRequestId(requestId);
    const result = await window.qmsApi.getWorkflowLogs(sessionToken, requestId);
    if (result.success) {
      setHistoryLogs(result.logs || []);
    } else {
      setAuthError(result.error || "로그를 불러올 수 없습니다.");
    }
  };

  const handleChangePassword = async () => {
    if (!sessionToken) return;
    setPasswordMessage(null);
    const result = await window.qmsApi.changePassword(
      sessionToken,
      passwordCurrent,
      passwordNext
    );
    if (result.success) {
      setPasswordMessage("비밀번호가 변경되었습니다.");
      setPasswordCurrent("");
      setPasswordNext("");
    } else {
      setPasswordMessage(result.error || "비밀번호 변경 실패");
    }
  };

  const refreshRagStatus = async () => {
    const status = await window.qmsApi.getRagStatus();
    setRagStatus(status);
  };

  const refreshModelInfo = async () => {
    setLoadingModels(true);
    try {
      const [models, config] = await Promise.all([
        window.qmsApi.listAvailableModels(),
        window.qmsApi.getCurrentModels(),
      ]);
      setAvailableChatModels(models.chatModels || []);
      setAvailableEmbeddingModels(models.embeddingModels || []);
      setCurrentModelConfig(config);
    } catch (e) {
      console.error("Failed to load model info", e);
    }
    setLoadingModels(false);
  };

  const handleConnect = async () => {
    const token = await ensureLogin();
    if (!token) return;
    const result = await window.qmsApi.connectDrive(token);
    if (!result.success && result.error) {
      alert(`연결 실패: ${result.error}`);
    }
  };

  const refreshFiles = async () => {
    setLoadingFiles(true);
    const res = await window.qmsApi.listSops();
    if (res.files) setFiles(res.files);
    if (res.offline) setOfflineMode(true);
    if (!res.offline) setOfflineMode(false);
    if (res.error) alert(res.error);
    setLoadingFiles(false);
  };

  const handleLearnSop = async (file: FileItem) => {
    const token = await ensureLogin();
    if (!token) return;

    setLearningFile(file.id);

    let result;
    if (offlineMode) {
      result = await window.qmsApi.learnCachedSop(token, file.id);
    } else {
      const fileName = file.name || file.fileName || "unknown";
      result = await window.qmsApi.learnSop(token, file.id, fileName);
    }

    if (result.success) {
      alert(`"${file.name || file.fileName}" 학습 완료!`);
    } else {
      alert(`학습 실패: ${result.error}`);
    }
    setLearningFile(null);
    refreshRagStatus();
  };

  const handleRunWorkflow = async () => {
    const token = await ensureLogin();
    if (!token) return;

    setProcessing(true);
    setWorkflowResult(null);
    setWorkflowLogs([]);

    try {
      const sheetInputs = {
        release: releaseInput.차수 ? releaseInput : undefined,
        vv: vvInput.차수 ? vvInput : undefined,
      };
      const response = await window.qmsApi.runFullWorkflow(
        token,
        changeInput,
        sheetInputs
      );
      setWorkflowResult(response);

      const requestId = response?.state?.requestId;
      if (requestId) {
        const shouldSign = window.confirm("전자 서명을 진행하시겠습니까?");
        if (shouldSign) {
          const meaning = window.prompt("서명 의미 (예: 승인)") || "승인";
          await window.qmsApi.signWorkflow(token, requestId, meaning);
          await loadHistory(token);
        }
      }
    } catch (e) {
      alert("워크플로우 실행 중 오류가 발생했습니다.");
    }
    setProcessing(false);
  };

  const handleQuery = async () => {
    setQuerying(true);
    setQueryResult(null);
    try {
      const response = await window.qmsApi.querySop(queryInput);
      setQueryResult(response);
    } catch (e) {
      alert("검색 중 오류가 발생했습니다.");
    }
    setQuerying(false);
  };

  const cardStyle: React.CSSProperties = {
    border: "1px solid #e0e0e0",
    borderRadius: "8px",
    padding: "20px",
    marginBottom: "20px",
    background: "white",
  };

  const buttonStyle: React.CSSProperties = {
    padding: "10px 20px",
    border: "none",
    borderRadius: "4px",
    cursor: "pointer",
    fontWeight: "bold",
  };

  const getVerdictColor = (verdict: string) => {
    switch (verdict) {
      case "APPROVED":
        return "#38a169";
      case "REJECTED":
        return "#e53e3e";
      default:
        return "#d69e2e";
    }
  };

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 350px",
        gap: "30px",
        padding: "30px",
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        background: "#f5f7fa",
        minHeight: "100vh",
      }}
    >
      <div>
        <h1 style={{ marginBottom: "5px" }}>MedTech QMS Automation</h1>
        <p style={{ color: "#666", marginTop: 0 }}>
          Multi-Agent 설계 변경 관리 시스템 (RA / QA / Dev)
        </p>
        <div style={{ marginBottom: "20px", display: "flex", gap: "10px" }}>
          {currentUser ? (
            <>
              <span style={{ fontSize: "13px", color: "#333" }}>
                로그인: {currentUser.username} ({currentUser.role})
              </span>
              <button
                onClick={handleLogout}
                style={{ ...buttonStyle, background: "#ccc", color: "#333" }}
              >
                로그아웃
              </button>
            </>
          ) : (
            <div style={{ display: "flex", gap: "10px", width: "100%" }}>
              <input
                value={loginUsername}
                onChange={(e) => setLoginUsername(e.target.value)}
                placeholder="Username"
                style={{ flex: 1, padding: "8px", border: "1px solid #ddd" }}
              />
              <input
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                placeholder="Password"
                type="password"
                style={{ flex: 1, padding: "8px", border: "1px solid #ddd" }}
              />
              <button
                onClick={handleLogin}
                style={{ ...buttonStyle, background: "#007bff", color: "white" }}
              >
                로그인
              </button>
            </div>
          )}
        </div>
        {authError && (
          <div style={{ color: "#e53e3e", marginBottom: "10px" }}>
            {authError}
          </div>
        )}
        {currentUser && (
          <div style={{ marginBottom: "15px" }}>
            <strong style={{ display: "block", marginBottom: "6px" }}>
              비밀번호 변경
            </strong>
            <div style={{ display: "flex", gap: "10px" }}>
              <input
                value={passwordCurrent}
                onChange={(e) => setPasswordCurrent(e.target.value)}
                placeholder="현재 비밀번호"
                type="password"
                style={{ flex: 1, padding: "8px", border: "1px solid #ddd" }}
              />
              <input
                value={passwordNext}
                onChange={(e) => setPasswordNext(e.target.value)}
                placeholder="새 비밀번호"
                type="password"
                style={{ flex: 1, padding: "8px", border: "1px solid #ddd" }}
              />
              <button
                onClick={handleChangePassword}
                style={{ ...buttonStyle, background: "#6c5ce7", color: "white" }}
              >
                변경
              </button>
            </div>
            {passwordMessage && (
              <div style={{ marginTop: "6px", color: "#555" }}>
                {passwordMessage}
              </div>
            )}
          </div>
        )}

        <div style={{ marginBottom: "20px" }}>
          <button
            onClick={() => setActiveTab("workflow")}
            style={{
              ...buttonStyle,
              background: activeTab === "workflow" ? "#007bff" : "#e0e0e0",
              color: activeTab === "workflow" ? "white" : "#333",
              marginRight: "10px",
            }}
          >
            설계 변경 워크플로우
          </button>
          <button
            onClick={() => setActiveTab("query")}
            style={{
              ...buttonStyle,
              background: activeTab === "query" ? "#007bff" : "#e0e0e0",
              color: activeTab === "query" ? "white" : "#333",
              marginRight: "10px",
            }}
          >
            SOP 질의응답
          </button>
          <button
            onClick={() => setActiveTab("users")}
            style={{
              ...buttonStyle,
              background: activeTab === "users" ? "#007bff" : "#e0e0e0",
              color: activeTab === "users" ? "white" : "#333",
              marginRight: "10px",
            }}
          >
            사용자 관리
          </button>
          <button
            onClick={() => setActiveTab("history")}
            style={{
              ...buttonStyle,
              background: activeTab === "history" ? "#007bff" : "#e0e0e0",
              color: activeTab === "history" ? "white" : "#333",
            }}
          >
            히스토리
          </button>
        </div>

        {activeTab === "workflow" && (
          <>
            <div style={cardStyle}>
              <h3 style={{ marginTop: 0 }}>설계 변경 요청</h3>
              <p style={{ color: "#666", fontSize: "14px" }}>
                RA, QA, Dev 전문가가 순차적으로 검토합니다.
              </p>
              <textarea
                value={changeInput}
                onChange={(e) => setChangeInput(e.target.value)}
                placeholder="변경하려는 기능을 상세히 설명하세요..."
                style={{
                  width: "100%",
                  height: "100px",
                  padding: "12px",
                  borderRadius: "4px",
                  border: "1px solid #ddd",
                  resize: "vertical",
                  boxSizing: "border-box",
                }}
              />
              <button
                onClick={handleRunWorkflow}
                disabled={processing || !changeInput.trim()}
                style={{
                  ...buttonStyle,
                  background: processing ? "#ccc" : "#6c5ce7",
                  color: "white",
                  width: "100%",
                  marginTop: "10px",
                }}
              >
                {processing ? "처리 중..." : "Multi-Agent 검토 실행"}
              </button>
            </div>

            <div style={cardStyle}>
              <h4 style={{ marginTop: 0 }}>Google Sheets 입력</h4>
              <p style={{ color: "#666", fontSize: "13px" }}>
                아래 값을 입력하면 워크플로우 완료 후 자동으로 시트에 추가됩니다.
              </p>

              <div style={{ marginBottom: "12px" }}>
                <strong>릴리스 현황</strong>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginTop: "6px" }}>
                  <input placeholder="차수" value={releaseInput.차수} onChange={(e) => setReleaseInput({ ...releaseInput, 차수: e.target.value })} />
                  <input placeholder="릴리스 버전" value={releaseInput.릴리스버전} onChange={(e) => setReleaseInput({ ...releaseInput, 릴리스버전: e.target.value })} />
                  <input placeholder="Submit" value={releaseInput.Submit} onChange={(e) => setReleaseInput({ ...releaseInput, Submit: e.target.value })} />
                  <input placeholder="영향 분류" value={releaseInput.영향분류} onChange={(e) => setReleaseInput({ ...releaseInput, 영향분류: e.target.value })} />
                  <input placeholder="QA 진행 상태" value={releaseInput.QA진행상태} onChange={(e) => setReleaseInput({ ...releaseInput, QA진행상태: e.target.value })} />
                  <input placeholder="배포 승인" value={releaseInput.배포승인} onChange={(e) => setReleaseInput({ ...releaseInput, 배포승인: e.target.value })} />
                  <input placeholder="상세기획 링크" value={releaseInput.상세기획} onChange={(e) => setReleaseInput({ ...releaseInput, 상세기획: e.target.value })} />
                  <input placeholder="릴리즈 기록 링크" value={releaseInput.릴리즈기록} onChange={(e) => setReleaseInput({ ...releaseInput, 릴리즈기록: e.target.value })} />
                </div>
              </div>

              <div style={{ marginBottom: "12px" }}>
                <strong>V&V 검증</strong>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginTop: "6px" }}>
                  <input placeholder="차수" value={vvInput.차수} onChange={(e) => setVvInput({ ...vvInput, 차수: e.target.value })} />
                  <input placeholder="검증 기록 링크" value={vvInput.검증기록} onChange={(e) => setVvInput({ ...vvInput, 검증기록: e.target.value })} />
                  <input placeholder="검증 결과" value={vvInput.검증결과} onChange={(e) => setVvInput({ ...vvInput, 검증결과: e.target.value })} />
                  <input placeholder="검증 완료일" value={vvInput.검증완료일} onChange={(e) => setVvInput({ ...vvInput, 검증완료일: e.target.value })} />
                  <input placeholder="주요 테스트 항목" value={vvInput.주요테스트항목} onChange={(e) => setVvInput({ ...vvInput, 주요테스트항목: e.target.value })} />
                  <input placeholder="특이사항" value={vvInput.특이사항} onChange={(e) => setVvInput({ ...vvInput, 특이사항: e.target.value })} />
                </div>
              </div>
            </div>

            {workflowLogs.length > 0 && (
              <div style={cardStyle}>
                <h4 style={{ marginTop: 0 }}>Agent 협업 로그</h4>
                <div
                  style={{
                    maxHeight: "200px",
                    overflowY: "auto",
                    background: "#1e1e1e",
                    padding: "10px",
                    borderRadius: "4px",
                    fontFamily: "monospace",
                    fontSize: "12px",
                  }}
                >
                  {workflowLogs.map((log, i) => (
                    <div key={i} style={{ marginBottom: "8px" }}>
                      <span style={{ color: "#888" }}>[{log.timestamp}]</span>{" "}
                      <span style={{ color: "#4fc3f7" }}>{log.phase}</span>
                      <div style={{ color: "#ddd", marginLeft: "20px" }}>
                        {log.message.slice(0, 200)}
                        {log.message.length > 200 && "..."}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {workflowResult && workflowResult.synthesis && (
              <div
                style={{
                  ...cardStyle,
                  borderLeft: `4px solid ${getVerdictColor(
                    workflowResult.synthesis.finalVerdict
                  )}`,
                }}
              >
                <h4 style={{ marginTop: 0 }}>
                  최종 판정: {workflowResult.synthesis.finalVerdict}
                </h4>
                <p>{workflowResult.synthesis.summary}</p>

                {workflowResult.synthesis.requiredDocuments?.length > 0 && (
                  <div style={{ marginTop: "15px" }}>
                    <strong>필요 문서:</strong>
                    <ul style={{ margin: "5px 0", paddingLeft: "20px" }}>
                      {workflowResult.synthesis.requiredDocuments.map(
                        (doc: string, i: number) => (
                          <li key={i}>{doc}</li>
                        )
                      )}
                    </ul>
                  </div>
                )}

                {workflowResult.synthesis.nextSteps?.length > 0 && (
                  <div style={{ marginTop: "15px" }}>
                    <strong>다음 단계:</strong>
                    <ol style={{ margin: "5px 0", paddingLeft: "20px" }}>
                      {workflowResult.synthesis.nextSteps.map(
                        (step: string, i: number) => (
                          <li key={i}>{step}</li>
                        )
                      )}
                    </ol>
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {activeTab === "query" && (
          <div style={cardStyle}>
            <h3 style={{ marginTop: 0 }}>SOP 질의응답</h3>
            <p style={{ color: "#666", fontSize: "14px" }}>
              학습된 SOP 문서를 기반으로 절차를 안내합니다.
            </p>
            <textarea
              value={queryInput}
              onChange={(e) => setQueryInput(e.target.value)}
              placeholder="예: 설계 변경 시 작성해야 할 문서는?"
              style={{
                width: "100%",
                height: "80px",
                padding: "12px",
                borderRadius: "4px",
                border: "1px solid #ddd",
                resize: "vertical",
                boxSizing: "border-box",
              }}
            />
            <button
              onClick={handleQuery}
              disabled={
                querying || !queryInput.trim() || ragStatus.documentCount === 0
              }
              style={{
                ...buttonStyle,
                background:
                  querying || ragStatus.documentCount === 0
                    ? "#ccc"
                    : "#28a745",
                color: "white",
                width: "100%",
                marginTop: "10px",
              }}
            >
              {querying
                ? "검색 중..."
                : ragStatus.documentCount === 0
                ? "SOP 학습 필요"
                : "SOP 검색"}
            </button>

            {queryResult && (
              <div
                style={{
                  marginTop: "20px",
                  padding: "15px",
                  borderRadius: "8px",
                  background: "#f8f9fa",
                  border: "1px solid #e0e0e0",
                }}
              >
                <p style={{ whiteSpace: "pre-wrap", lineHeight: 1.6 }}>
                  {queryResult.answer}
                </p>
                {queryResult.sources?.length > 0 && (
                  <p
                    style={{
                      fontSize: "12px",
                      color: "#666",
                      marginTop: "10px",
                    }}
                  >
                    Sources: {queryResult.sources.join(", ")}
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {activeTab === "users" && (
          <div style={cardStyle}>
            <h3 style={{ marginTop: 0 }}>사용자 관리</h3>
            {currentUser?.role !== "ADMIN" ? (
              <p style={{ color: "#666" }}>관리자 전용 기능입니다.</p>
            ) : (
              <>
                <div style={{ marginBottom: "10px" }}>
                  <input
                    value={newUserName}
                    onChange={(e) => setNewUserName(e.target.value)}
                    placeholder="새 사용자 이름"
                    style={{ padding: "8px", border: "1px solid #ddd", marginRight: "6px" }}
                  />
                  <input
                    value={newUserPassword}
                    onChange={(e) => setNewUserPassword(e.target.value)}
                    placeholder="임시 비밀번호"
                    type="password"
                    style={{ padding: "8px", border: "1px solid #ddd", marginRight: "6px" }}
                  />
                  <select
                    value={newUserRole}
                    onChange={(e) => setNewUserRole(e.target.value)}
                    style={{ padding: "8px", border: "1px solid #ddd", marginRight: "6px" }}
                  >
                    <option value="ADMIN">ADMIN</option>
                    <option value="QA">QA</option>
                    <option value="RA">RA</option>
                    <option value="DEV">DEV</option>
                    <option value="VIEWER">VIEWER</option>
                  </select>
                  <button
                    onClick={handleCreateUser}
                    style={{ ...buttonStyle, background: "#007bff", color: "white" }}
                  >
                    사용자 추가
                  </button>
                </div>
                <div>
                  {users.length === 0 ? (
                    <p style={{ color: "#666" }}>등록된 사용자가 없습니다.</p>
                  ) : (
                    <ul style={{ paddingLeft: "16px" }}>
                      {users.map((u) => (
                        <li key={u.id}>
                          {u.username} ({u.role}) - {new Date(u.createdAt).toLocaleDateString("ko-KR")}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {activeTab === "history" && (
          <div style={cardStyle}>
            <h3 style={{ marginTop: 0 }}>히스토리</h3>
            {!sessionToken ? (
              <p style={{ color: "#666" }}>로그인 후 확인 가능합니다.</p>
            ) : (
              <>
                <div style={{ marginBottom: "15px" }}>
                  <strong>워크플로우 기록</strong>
                  {workflowHistory.length === 0 ? (
                    <p style={{ color: "#666" }}>기록이 없습니다.</p>
                  ) : (
                    <ul style={{ paddingLeft: "16px" }}>
                      {workflowHistory.map((wf) => (
                        <li key={wf.requestId}>
                          <button
                            onClick={() => handleLoadLogs(wf.requestId)}
                            style={{ ...buttonStyle, background: "#e0e0e0", color: "#333", marginRight: "6px" }}
                          >
                            로그 보기
                          </button>
                          {wf.requestId} - {wf.finalVerdict || wf.status}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                {selectedRequestId && (
                  <div style={{ marginBottom: "15px" }}>
                    <strong>선택된 로그: {selectedRequestId}</strong>
                    {historyLogs.length === 0 ? (
                      <p style={{ color: "#666" }}>로그가 없습니다.</p>
                    ) : (
                      <ul style={{ paddingLeft: "16px" }}>
                        {historyLogs.map((log, idx) => (
                          <li key={idx}>
                            [{log.role}] {log.verdict || ""} {log.content.slice(0, 120)}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
                <div style={{ marginBottom: "15px" }}>
                  <strong>전자 서명 기록</strong>
                  {signatureHistory.length === 0 ? (
                    <p style={{ color: "#666" }}>서명 기록이 없습니다.</p>
                  ) : (
                    <ul style={{ paddingLeft: "16px" }}>
                      {signatureHistory.map((sig, idx) => (
                        <li key={idx}>
                          {sig.requestId} - {sig.role} ({sig.meaning})
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                {currentUser?.role === "ADMIN" && (
                  <div>
                    <strong>보안 이벤트</strong>
                    {securityEvents.length === 0 ? (
                      <p style={{ color: "#666" }}>보안 이벤트가 없습니다.</p>
                    ) : (
                      <ul style={{ paddingLeft: "16px" }}>
                        {securityEvents.map((ev) => (
                          <li key={ev.id}>
                            {ev.type} - {ev.username || ""} {ev.detail || ""}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      <div>
        <div style={cardStyle}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "15px",
            }}
          >
            <h3 style={{ margin: 0 }}>SOP Repository</h3>
            {!driveConnected ? (
              <button
                onClick={handleConnect}
                style={{
                  ...buttonStyle,
                  background: "#ea4335",
                  color: "white",
                  fontSize: "12px",
                  padding: "6px 12px",
                }}
              >
                Drive 연결
              </button>
            ) : (
              <span style={{ color: "green", fontSize: "12px" }}>
                Connected
              </span>
            )}
          </div>

          <div
            style={{
              padding: "10px",
              background: "#e8f5e9",
              borderRadius: "4px",
              marginBottom: "15px",
              fontSize: "13px",
            }}
          >
            <strong>RAG:</strong> {ragStatus.documentCount} / {ragStatus.maxChunks} chunks
            {offlineMode && (
              <span style={{ marginLeft: "8px", color: "#e67e22" }}>
                Offline Mode
              </span>
            )}
          </div>

          <div style={{ maxHeight: "400px", overflowY: "auto" }}>
            {loadingFiles ? (
              <p style={{ color: "#666" }}>Loading...</p>
            ) : files.length === 0 ? (
              <p style={{ color: "#999", fontSize: "13px" }}>
                Drive 연결 후 SOP 파일이 표시됩니다.
              </p>
            ) : (
              files.map((f) => (
                <div
                  key={f.id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "10px",
                    borderBottom: "1px solid #eee",
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontWeight: 500,
                        fontSize: "13px",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {f.name || f.fileName}
                    </div>
                  </div>
                  <button
                    onClick={() => handleLearnSop(f)}
                    disabled={learningFile === f.id}
                    style={{
                      ...buttonStyle,
                      background: learningFile === f.id ? "#ccc" : "#6c5ce7",
                      color: "white",
                      fontSize: "11px",
                      padding: "4px 10px",
                      marginLeft: "10px",
                    }}
                  >
                    {learningFile === f.id ? "..." : "Learn"}
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        <div style={cardStyle}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "15px",
            }}
          >
            <h3 style={{ margin: 0 }}>AI Model</h3>
            <button
              onClick={refreshModelInfo}
              disabled={loadingModels}
              style={{
                ...buttonStyle,
                background: "#6c5ce7",
                color: "white",
                fontSize: "12px",
                padding: "6px 12px",
              }}
            >
              {loadingModels ? "..." : "Refresh"}
            </button>
          </div>

          {currentModelConfig && (
            <div style={{ fontSize: "13px", marginBottom: "15px" }}>
              <div style={{ marginBottom: "8px" }}>
                <strong>Chat Model:</strong>{" "}
                <span style={{ color: "#6c5ce7" }}>{currentModelConfig.chatModel}</span>
              </div>
              <div style={{ marginBottom: "8px" }}>
                <strong>Embedding:</strong>{" "}
                <span style={{ color: "#6c5ce7" }}>{currentModelConfig.embeddingModel}</span>
              </div>
              <div>
                <strong>Temperature:</strong>{" "}
                <span style={{ color: "#6c5ce7" }}>{currentModelConfig.temperature}</span>
              </div>
            </div>
          )}

          <div style={{ fontSize: "12px", color: "#666" }}>
            <details>
              <summary style={{ cursor: "pointer", marginBottom: "8px" }}>
                Available Chat Models ({availableChatModels.length})
              </summary>
              <div style={{ maxHeight: "150px", overflowY: "auto", paddingLeft: "10px" }}>
                {availableChatModels.map((m) => (
                  <div key={m.name} style={{ marginBottom: "4px" }}>
                    {m.name}
                  </div>
                ))}
              </div>
            </details>
            <details>
              <summary style={{ cursor: "pointer", marginBottom: "8px" }}>
                Available Embedding Models ({availableEmbeddingModels.length})
              </summary>
              <div style={{ maxHeight: "150px", overflowY: "auto", paddingLeft: "10px" }}>
                {availableEmbeddingModels.map((m) => (
                  <div key={m.name} style={{ marginBottom: "4px" }}>
                    {m.name}
                  </div>
                ))}
              </div>
            </details>
          </div>

          <div
            style={{
              marginTop: "15px",
              padding: "10px",
              background: "#fff3cd",
              borderRadius: "4px",
              fontSize: "12px",
              color: "#856404",
            }}
          >
            Model settings can be changed in <code>.env</code> file.
            <br />
            **App restart is required to apply changes.**
          </div>
        </div>
      </div>
    </div>
  );
};

const root = ReactDOM.createRoot(
  document.getElementById("root") as HTMLElement
);
root.render(<App />);
