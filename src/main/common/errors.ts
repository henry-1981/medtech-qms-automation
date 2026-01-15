export class QmsError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = "QmsError";
  }
}

export class DriveConnectionError extends QmsError {
  constructor(message: string, cause?: unknown) {
    super(message, "DRIVE_CONNECTION_ERROR", cause);
    this.name = "DriveConnectionError";
  }
}

export class DriveQueryError extends QmsError {
  constructor(message: string, cause?: unknown) {
    super(message, "DRIVE_QUERY_ERROR", cause);
    this.name = "DriveQueryError";
  }
}

export class DocumentParseError extends QmsError {
  constructor(message: string, cause?: unknown) {
    super(message, "DOCUMENT_PARSE_ERROR", cause);
    this.name = "DocumentParseError";
  }
}

export class VectorStoreError extends QmsError {
  constructor(message: string, cause?: unknown) {
    super(message, "VECTOR_STORE_ERROR", cause);
    this.name = "VectorStoreError";
  }
}

export class AgentError extends QmsError {
  constructor(message: string, cause?: unknown) {
    super(message, "AGENT_ERROR", cause);
    this.name = "AgentError";
  }
}

export class ValidationError extends QmsError {
  constructor(message: string, cause?: unknown) {
    super(message, "VALIDATION_ERROR", cause);
    this.name = "ValidationError";
  }
}

export function formatError(error: unknown): string {
  if (error instanceof QmsError) {
    return `[${error.code}] ${error.message}`;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}
