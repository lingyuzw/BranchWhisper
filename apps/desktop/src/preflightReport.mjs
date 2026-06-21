export function parsePreflightArgs(args) {
  const result = { format: "json", output: "" };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--format") {
      result.format = args[index + 1] === "text" ? "text" : "json";
      index += 1;
    } else if (arg === "--output") {
      result.output = args[index + 1] || "";
      index += 1;
    }
  }

  return result;
}

export function formatPreflightReport(report, format = "json") {
  if (format !== "text") {
    return JSON.stringify(report, null, 2);
  }

  const lines = [`BranchWhisper desktop preflight: ${report.ok ? "PASS" : "NEEDS ATTENTION"}`, ""];

  for (const item of report.checks) {
    lines.push(`${item.ok ? "PASS" : "FAIL"} ${item.name}`);
    lines.push(`  Detail: ${item.detail}`);

    if (!item.ok && item.fix) {
      lines.push(`  Fix: ${item.fix}`);
    }
  }

  return lines.join("\n");
}
