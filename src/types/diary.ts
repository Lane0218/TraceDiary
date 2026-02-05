export interface DiaryEntry {
  date: string;
  content: string;
  word_count: number;
  modified_at: string;
}

export interface SaveDiaryInput {
  date: string;
  content: string;
}

