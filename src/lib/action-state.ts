export interface ActionState {
  ok?: boolean;
  error?: string;
  message?: string;
}

export const EMPTY_STATE: ActionState = {};
