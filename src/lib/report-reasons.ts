/** Shared by the report dialog (client) and the report table (server). */
export const REPORT_REASONS = {
  spam: "Spam or scam",
  harassment: "Harassment or bullying",
  hate: "Hate speech",
  sexual: "Sexual content",
  violence: "Violence or threats",
  illegal: "Illegal content",
  copyright: "Copyright infringement",
  malware_phishing: "Malware or phishing",
  personal_info: "Someone's private information",
  other: "Something else",
} as const;
export type ReportReason = keyof typeof REPORT_REASONS;
export const reportReasons = Object.keys(REPORT_REASONS) as [ReportReason, ...ReportReason[]];
