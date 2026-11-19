// Shared types used by both server and client code.

/** A verified pointer back into an uploaded PDF. */
export interface SourceRef {
  documentId: string;
  documentName: string;
  page: number;
  quote: string;
  /** exact: quote found verbatim; close: most words found on the page; unverified: page exists but quote not found */
  match: "exact" | "close" | "unverified";
}

/** "stated" = explicitly in the PDF. "ai_explanation" = simplified explanation written by the AI. */
export type Origin = "stated" | "ai_explanation";

export type MustRememberCategory =
  | "definition"
  | "concept"
  | "person"
  | "date_event"
  | "process"
  | "formula"
  | "classification";

export interface MustRememberItem {
  category: MustRememberCategory;
  term: string;
  content: string;
  topic: string;
  /** Only for formulas: how / when the formula is used. */
  application: string | null;
  /** Only for processes / sequences: ordered steps. */
  steps: string[];
  origin: Origin;
  sources: SourceRef[];
}

export interface UnderstandItem {
  topic: string;
  title: string;
  explanation: string;
  example: string | null;
  connections: string[];
  origin: Origin;
  sources: SourceRef[];
}

export interface ConfusedItem {
  terms: string[];
  distinction: string;
  memoryTip: string | null;
  sources: SourceRef[];
}

export interface QuickRevisionItem {
  point: string;
  sources: SourceRef[];
}

export interface StudyGuide {
  title: string;
  language: "en" | "id" | "mixed";
  overview: string;
  topics: { name: string; summary: string }[];
  mustRemember: MustRememberItem[];
  understand: UnderstandItem[];
  commonlyConfused: ConfusedItem[];
  quickRevision: QuickRevisionItem[];
  /** Things the material does not explain, or explains unclearly. */
  gaps: string[];
  /** Places where two documents disagree. */
  conflicts: { description: string; sources: SourceRef[] }[];
  meta: {
    model: string;
    generatedAt: string;
    pagesUsed: number;
    pagesUnreadable: number;
    referencesRemoved: number;
  };
}

export type QuestionType =
  | "multiple_choice"
  | "true_false"
  | "fill_blank"
  | "short_answer"
  | "application";

/** A question as sent to the browser: never includes the answer key. */
export interface PublicQuestion {
  id: string;
  position: number;
  type: QuestionType;
  topic: string;
  difficulty: 1 | 2 | 3;
  prompt: string;
  options: string[];
}

export interface AnswerResult {
  questionId: string;
  score: 0 | 0.5 | 1;
  verdict: "correct" | "partially_correct" | "incorrect";
  feedback: string;
  explanation: string;
  correctAnswer: string;
  sources: SourceRef[];
}

export type MasteryLevel = "strong" | "developing" | "needs_revision";

export interface TopicMastery {
  topic: string;
  percent: number;
  level: MasteryLevel;
  attempts: number;
  /** Difficulty (1-3) the next practice questions for this topic should target. */
  nextDifficulty: 1 | 2 | 3;
  trend: "up" | "down" | "flat";
}
