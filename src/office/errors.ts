/** An error that carries its HTTP status and the contract's error code. */
export class OfficeError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}
