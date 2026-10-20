export type DrawMode = 'RANDOM' | 'MANUAL';

export interface DrawDto {
  id: string;
  roundId: string;
  sequenceNumber: number;
  drawMode: string;
  questionId: string;
  keyId: string;
  questionText: string;
  keyValue: string;
  drawnAt: string;
}

export interface ParticipantDrawDto {
  id: string;
  roundId: string;
  sequenceNumber: number;
  drawMode: string;
  questionText: string;
  keyValue: string;
  drawnAt: string;
}
