import { z } from "zod";

export const releaseRowSchema = z.object({
  차수: z.string().min(1),
  릴리스버전: z.string().min(1),
  Submit: z.string().min(1),
  영향분류: z.string().min(1),
  QA진행상태: z.string().min(1),
  배포승인: z.string().min(1),
  상세기획: z.string().optional().default(""),
  릴리즈기록: z.string().optional().default(""),
});

export const vvRowSchema = z.object({
  차수: z.string().min(1),
  검증기록: z.string().optional().default(""),
  검증결과: z.string().min(1),
  검증완료일: z.string().optional().default(""),
  주요테스트항목: z.string().optional().default(""),
  특이사항: z.string().optional().default(""),
});

export type ReleaseRowInput = z.infer<typeof releaseRowSchema>;
export type VvRowInput = z.infer<typeof vvRowSchema>;

export function mapReleaseRow(input: ReleaseRowInput): (string | number | boolean | null)[] {
  return [
    input.차수,
    input.릴리스버전,
    input.Submit,
    input.영향분류,
    input.QA진행상태,
    input.배포승인,
    input.상세기획 || "",
    input.릴리즈기록 || "",
  ];
}

export function mapVvRow(input: VvRowInput): (string | number | boolean | null)[] {
  return [
    input.차수,
    input.검증기록 || "",
    input.검증결과,
    input.검증완료일 || "",
    input.주요테스트항목 || "",
    input.특이사항 || "",
  ];
}
