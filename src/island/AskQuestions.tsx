import { useState } from "react";
import type { PermissionRequest, Question } from "../claude/sessions";
import { useClaudeStore } from "../claude/store";
import { t } from "../i18n";

/** The size of the island while Claude's questions are answered in it (the options listed, the answer to send). */
export function answeringSize(questions: Question[]): { w: number; h: number } {
  const rows = questions.reduce((h, q) => h + 30 + q.options.length * 42 + 36, 0);
  return { w: 560, h: Math.min(400, 52 + rows + 54) };
}

/** The answer to one question: the chosen labels (one, or several for a multiple-select one) or what was typed. */
type Answer = { picked: string[]; other: string };

/** The answers as Claude Code takes them: the question's text to the answer (several labels joined by ", "). */
export function answersFor(questions: Question[], answers: Answer[]): Record<string, string> | null {
  const out: Record<string, string> = {};
  for (const [i, q] of questions.entries()) {
    const a = answers[i];
    const value = a?.other.trim() || a?.picked.join(", ");
    if (!value) return null;
    out[q.question] = value;
  }
  return out;
}

/**
 * Claude asks something with choices (AskUserQuestion). Folded, the pill shows the question and "Responder"; open,
 * it lists each question with its options (and a field for another answer), and sends the answers to Claude Code.
 * "No terminal" leaves it to the terminal, as if Docky were not there.
 */
export function AskQuestions({
  request,
  open,
  onOpen,
}: {
  request: PermissionRequest & { project: string };
  open: boolean;
  onOpen: (open: boolean) => void;
}) {
  const questions = request.questions ?? [];
  const [answers, setAnswers] = useState<Answer[]>(() => questions.map(() => ({ picked: [], other: "" })));
  const decide = useClaudeStore((s) => s.decide);
  const ready = answersFor(questions, answers);

  const pick = (qi: number, label: string) =>
    setAnswers((all) =>
      all.map((a, i) => {
        if (i !== qi) return a;
        if (!questions[qi].multiSelect) return { picked: [label], other: "" };
        return { ...a, picked: a.picked.includes(label) ? a.picked.filter((l) => l !== label) : [...a.picked, label] };
      }),
    );
  const type = (qi: number, other: string) => setAnswers((all) => all.map((a, i) => (i === qi ? { picked: other.trim() ? [] : a.picked, other } : a)));
  const toTerminal = () => {
    onOpen(false);
    decide(request.id, false, { terminal: true });
  };
  const send = () => {
    if (!ready) return;
    onOpen(false);
    decide(request.id, true, { answers: ready });
  };

  if (!open) {
    return (
      <>
        <div className="ask-top">
          <span className="dot wait" />
          {t("Claude Code pergunta")}
          {questions.length > 1 ? ` · ${t("{n} perguntas", { n: questions.length })}` : ""}
        </div>
        <div className="ask-meta">
          <span className="chip">{questions[0]?.header || t("Pergunta")}</span>
          <span>{t("projeto {project}", { project: request.project })}</span>
        </div>
        <div className="ask-cmd" title={questions[0]?.question}>
          {questions[0]?.question}
        </div>
        <div className="ask-btns">
          <button className="btn-deny" onClick={toTerminal}>
            {t("No terminal")}
          </button>
          <button className="btn-allow" onClick={() => onOpen(true)}>
            {t("Responder")}
          </button>
        </div>
      </>
    );
  }

  return (
    <div className="aq">
      <div className="ask-top aq-top">
        <span className="dot wait" />
        {t("Claude Code pergunta")} · {t("projeto {project}", { project: request.project })}
      </div>
      <div className="aq-list">
        {questions.map((q, qi) => (
          <fieldset key={q.question} className="aq-q">
            <legend>
              {q.header && <span className="chip">{q.header}</span>}
              <b>{q.question}</b>
              {q.multiSelect && <em>{t("pode escolher mais de uma")}</em>}
            </legend>
            {q.options.map((o) => {
              const on = answers[qi]?.picked.includes(o.label);
              return (
                <button key={o.label} className={`aq-opt${on ? " on" : ""}`} role={q.multiSelect ? "checkbox" : "radio"} aria-checked={on} onClick={() => pick(qi, o.label)}>
                  <i aria-hidden="true" className={q.multiSelect ? "box" : "ring"} />
                  <span>
                    <b>{o.label}</b>
                    {o.description && <small>{o.description}</small>}
                  </span>
                </button>
              );
            })}
            <input className="aq-other" placeholder={t("Outra resposta…")} aria-label={t("Outra resposta para: {q}", { q: q.question })} value={answers[qi]?.other ?? ""} onChange={(e) => type(qi, e.target.value)} />
          </fieldset>
        ))}
      </div>
      <div className="ask-btns aq-btns">
        <button className="btn-deny" onClick={toTerminal}>
          {t("No terminal")}
        </button>
        <button className="btn-allow" disabled={!ready} onClick={send}>
          {t("Enviar")}
        </button>
      </div>
    </div>
  );
}
