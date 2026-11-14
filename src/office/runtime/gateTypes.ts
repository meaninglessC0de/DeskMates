export interface ApprovalRequest {
  title: string;
  detail: string;
  kind?: 'tool' | 'big_step';
}
