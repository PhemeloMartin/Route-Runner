export type StreamId = 'network' | 'cloud' | 'forex';

export type QuestionType = 'single' | 'multi' | 'input';

export interface Question {
  id: string;
  type: QuestionType;
  prompt: string;
  choices: string[];
  /** indexes of correct choices (single/multi) */
  correct: number[];
  /** accepted answers for "input" questions (case-insensitive, spaces ignored) */
  accept: string[];
  explanation: string;
  domain?: string;
  /** Code block shown with the question (e.g. CLI output to interpret). */
  exhibit?: string;
}

export interface Term {
  term: string;
  plain: string;
}

export interface LabRef {
  kind: 'network' | 'linux' | 'cloud' | 'hpc' | 'rack' | 'pcbuild' | 'cable' | 'vm' | 'trading' | 'drill' | 'k8s3d';
  id: string;
  title?: string;
}

export interface Lesson {
  id: string;
  chapterId: string;
  stream: StreamId;
  title: string;
  minutes: number;
  analogy: string;
  objectives: string[];
  body: string; // markdown
  terms: Term[];
  pro: string[]; // "say it like a pro" sentences
  interview?: { q: string; a: string };
  quiz: Question[];
  labs: LabRef[];
}

export interface Chapter {
  id: string;
  stream: StreamId;
  number: number;
  title: string;
  story: string;
  domain?: string;
  sources: string[];
  lessons: Lesson[];
  boss: Question[];
  labs: LabRef[];
}

export interface Stream {
  id: StreamId;
  title: string;
  tagline: string;
  color: string;
  building: string;
  goal: string;
  certs: string[];
  chapters: Chapter[];
}

export interface Flashcard {
  id: string;
  stream: StreamId;
  front: string;
  back: string;
  source: string;
}
