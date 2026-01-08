// Feedback Domain - Public exports

// Components
export { FeedbackWidget, FeedbackWidgetWrapper, FeedbackModal, FeedbackForm, ScreenshotButton } from "./components";

// Hooks
export { useFeedback } from "./hooks";

// Types
export type { Feedback, FeedbackType, FeedbackStatus } from "./types";
export {
  FEEDBACK_TYPE_LABELS,
  FEEDBACK_TYPE_PLACEHOLDERS,
  MESSAGE_MIN_LENGTH,
  MESSAGE_MAX_LENGTH,
  MAX_SCREENSHOT_SIZE,
} from "./types";
