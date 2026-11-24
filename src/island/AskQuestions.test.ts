import { describe, expect, it } from "vitest";
import type { Question } from "../claude/sessions";
import { answeringSize, answersFor } from "./AskQuestions";

const questions: Question[] = [
  { question: "Qual banco?", header: "Banco", multiSelect: false, options: [{ label: "Postgres", description: "" }, { label: "SQLite", description: "" }] },
  { question: "Quais telas?", header: "Telas", multiSelect: true, options: [{ label: "Login", description: "" }, { label: "Painel", description: "" }] },
];

describe("respostas às perguntas do Claude", () => {
  it("junta as escolhas de cada pergunta (várias com vírgula) e prefere o que foi digitado", () => {
    expect(answersFor(questions, [{ picked: ["SQLite"], other: "" }, { picked: ["Login", "Painel"], other: "" }])).toEqual({ "Qual banco?": "SQLite", "Quais telas?": "Login, Painel" });
    expect(answersFor(questions, [{ picked: ["SQLite"], other: "  MySQL " }, { picked: ["Login"], other: "" }])).toEqual({ "Qual banco?": "MySQL", "Quais telas?": "Login" });
  });

  it("só dá para enviar com todas respondidas", () => {
    expect(answersFor(questions, [{ picked: ["SQLite"], other: "" }, { picked: [], other: " " }])).toBeNull();
  });

  it("a ilha cresce com as opções, até o tamanho que cabe", () => {
    expect(answeringSize(questions).h).toBeLessThanOrEqual(400);
    expect(answeringSize(questions.slice(0, 1)).h).toBeLessThan(answeringSize(questions).h);
  });
});
