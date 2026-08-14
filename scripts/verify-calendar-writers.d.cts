declare const calendarWriterGuard: {
  findViolationsInText(
    relativePath: string,
    source: string
  ): Array<{
    code: string;
    file: string;
    line: number;
    reason: string;
  }>;
};

export = calendarWriterGuard;
