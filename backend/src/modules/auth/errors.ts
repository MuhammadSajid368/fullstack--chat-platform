/**
 * Auth-module persistence / domain signals mapped by the service layer.
 */
export class DuplicateEmailError extends Error {
  constructor() {
    super("EMAIL_ALREADY_REGISTERED");
    this.name = "DuplicateEmailError";
  }
}
