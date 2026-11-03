import { describe, expect, it } from "vitest";
import { cleanTitle, lrcFromNetease, mainArtist, normalize, pickNeteaseSong } from "./lyrics";

const query = { title: "Evidências - Ao Vivo", artist: "Chitãozinho & Xororó", album: "", durationMs: 245_000 };

describe("busca de letras", () => {
  it("tira do título o que atrapalha a busca", () => {
    expect(cleanTitle("Evidências - Ao Vivo")).toBe("Evidências");
    expect(cleanTitle("Trem-Bala")).toBe("Trem-Bala");
    expect(cleanTitle("Heaven (feat. Fulano) [Remastered 2011]")).toBe("Heaven");
    expect(cleanTitle("(Intro)")).toBe("(Intro)");
  });

  it("fica com o primeiro artista", () => {
    expect(mainArtist("Chitãozinho & Xororó")).toBe("Chitãozinho");
    expect(mainArtist("Anitta, Ludmilla feat. Alguém")).toBe("Anitta");
    expect(mainArtist("Matheus e Kauan")).toBe("Matheus");
    expect(mainArtist("Ana Vilela")).toBe("Ana Vilela");
  });

  it("compara sem acento nem pontuação", () => {
    expect(normalize("Evidências!")).toBe("evidencias");
  });

  it("escolhe a música do NetEase só se título, artista e duração batem", () => {
    const songs = [
      { id: 1, name: "Evidências", artists: [{ name: "Outro Artista" }], duration: 245_000 },
      { id: 2, name: "Evidências", artists: [{ name: "Chitãozinho & Xororó" }], duration: 400_000 },
      { id: 3, name: "Evidências (Ao Vivo)", artists: [{ name: "Chitaozinho & Xororo" }], duration: 243_500 },
    ];
    expect(pickNeteaseSong(songs, query)?.id).toBe(3);
    expect(pickNeteaseSong(songs.slice(0, 2), query)).toBeUndefined();
  });

  it("aceita qualquer duração quando a faixa não informa a dela", () => {
    const songs = [{ id: 9, name: "Evidências", artists: [{ name: "Chitãozinho" }], duration: 400_000 }];
    expect(pickNeteaseSong(songs, { ...query, durationMs: 0 })?.id).toBe(9);
  });

  it("tira as linhas de crédito da letra do NetEase", () => {
    const lines = lrcFromNetease("[00:00.000] 作曲 : Ana Vilela\n[00:10.001]Não é sobre ter\n[00:15.001]é sobre saber");
    expect(lines.map((l) => l.text)).toEqual(["Não é sobre ter", "é sobre saber"]);
  });
});
