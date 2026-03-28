import React, { useEffect, useRef, useState } from "react";
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { supabase } from "../supabase";

type CzatWidgetProps = {
  idPracownika: string | string[];
  nazwaPracownika: string | string[];
  rola: string | string[];
};

const DOSTEPNE_REAKCJE = ["👍", "❤️", "😂", "😮", "😢", "✅"];

export default function CzatWidget({
  idPracownika,
  nazwaPracownika,
  rola,
}: CzatWidgetProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [wiadomosci, setWiadomosci] = useState<any[]>([]);
  const [nowaWiadomosc, setNowaWiadomosc] = useState("");
  const [nieprzeczytane, setNieprzeczytane] = useState(0);

  // --- STAN DLA OZNACZEŃ (@Mentions) ---
  const [wszyscyPracownicy, setWszyscyPracownicy] = useState<string[]>([]);
  const [pokazPodpowiedzi, setPokazPodpowiedzi] = useState(false);
  const [pracownicyPodpowiedzi, setPracownicyPodpowiedzi] = useState<string[]>(
    [],
  );

  // --- STAN DLA REAKCJI ---
  const [hoveredMsgId, setHoveredMsgId] = useState<string | null>(null);
  const [aktywnyMenuReakcji, setAktywnyMenuReakcji] = useState<string | null>(
    null,
  );
  const [hoveredEmoji, setHoveredEmoji] = useState<string | null>(null);

  // NOWE: Stan do pokazywania/ukrywania szczegółów kto kliknął łapkę
  const [pokazKtoZareagowalId, setPokazKtoZareagowalId] = useState<
    string | null
  >(null);

  const flatListRef = useRef<FlatList>(null);
  const inputRef = useRef<TextInput>(null);

  const bezpieczneId = Array.isArray(idPracownika)
    ? idPracownika[0]
    : idPracownika;
  const bezpiecznaNazwa = Array.isArray(nazwaPracownika)
    ? nazwaPracownika[0]
    : nazwaPracownika;
  const bezpiecznaRola = Array.isArray(rola) ? rola[0] : rola;

  useEffect(() => {
    pobierzWiadomosci();
    if (isOpen) pobierzPracownikowDoOznaczen();

    const subskrypcja = supabase
      .channel("public:czat_kadra")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "czat_kadra" },
        (payload) => {
          if (payload.eventType === "INSERT") {
            const nowa = payload.new;
            setWiadomosci((prev) => [...prev, nowa]);
            if (!isOpen && nowa.id_pracownika !== bezpieczneId) {
              setNieprzeczytane((prev) => prev + 1);
            }
          } else if (payload.eventType === "UPDATE") {
            setWiadomosci((prev) =>
              prev.map((w) => (w.id === payload.new.id ? payload.new : w)),
            );
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(subskrypcja);
    };
  }, [isOpen]);

  const pobierzWiadomosci = async () => {
    const { data } = await supabase
      .from("czat_kadra")
      .select("*")
      .order("utworzono", { ascending: true })
      .limit(50);
    if (data) setWiadomosci(data);
  };

  const pobierzPracownikowDoOznaczen = async () => {
    try {
      const { data, error } = await supabase
        .from("pracownicy")
        .select("nazwa_wyswietlana, rola")
        .in("rola", [
          "dyrektor",
          "kierownik_produkcji",
          "admin",
          "krojcza_kierownik_szwalni",
          "biuro",
        ])
        .neq("nazwa_wyswietlana", bezpiecznaNazwa);

      if (error) {
        console.error("Błąd pobierania pracowników do czatu:", error);
        return;
      }

      if (data) {
        const imiona = data.map((p) => p.nazwa_wyswietlana).filter(Boolean);
        setWszyscyPracownicy(["Wszyscy", ...imiona]);
      }
    } catch (err) {
      console.error("Krytyczny błąd pobierania pracowników:", err);
    }
  };

  const wyslijWiadomosc = async () => {
    if (!nowaWiadomosc.trim()) return;
    const tekst = nowaWiadomosc.trim();
    setNowaWiadomosc("");
    setPokazPodpowiedzi(false);
    setAktywnyMenuReakcji(null);
    setPokazKtoZareagowalId(null);

    await supabase.from("czat_kadra").insert([
      {
        id_pracownika: bezpieczneId,
        nazwa_pracownika: bezpiecznaNazwa || "Nieznany",
        rola: bezpiecznaRola || "brak",
        wiadomosc: tekst,
      },
    ]);
  };

  const toggleReakcja = async (
    wiadomoscId: string,
    reakcjeBazy: any,
    wybraneEmoji: string,
  ) => {
    const aktualneReakcje = { ...reakcjeBazy };
    let usunietoToSamo = false;

    for (const emoji in aktualneReakcje) {
      if (aktualneReakcje[emoji].includes(bezpiecznaNazwa)) {
        aktualneReakcje[emoji] = aktualneReakcje[emoji].filter(
          (n: string) => n !== bezpiecznaNazwa,
        );
        if (emoji === wybraneEmoji) {
          usunietoToSamo = true;
        }
      }
    }

    if (!usunietoToSamo) {
      if (!aktualneReakcje[wybraneEmoji]) aktualneReakcje[wybraneEmoji] = [];
      aktualneReakcje[wybraneEmoji].push(bezpiecznaNazwa);
    }

    for (const emoji in aktualneReakcje) {
      if (aktualneReakcje[emoji].length === 0) delete aktualneReakcje[emoji];
    }

    setAktywnyMenuReakcji(null);
    setWiadomosci((prev) =>
      prev.map((w) =>
        w.id === wiadomoscId ? { ...w, reakcje: aktualneReakcje } : w,
      ),
    );

    await supabase
      .from("czat_kadra")
      .update({ reakcje: aktualneReakcje })
      .eq("id", wiadomoscId);
  };

  const otworzCzat = () => {
    setIsOpen(true);
    setNieprzeczytane(0);
  };

  const handleTextChange = (text: string) => {
    setNowaWiadomosc(text);
    const words = text.split(" ");
    const lastWord = words[words.length - 1];

    if (lastWord.startsWith("@")) {
      const fraza = lastWord.substring(1).toLowerCase();
      const pasujacy = wszyscyPracownicy.filter((p) =>
        p.toLowerCase().includes(fraza),
      );
      setPracownicyPodpowiedzi(pasujacy);
      setPokazPodpowiedzi(pasujacy.length > 0);
    } else if (lastWord.length >= 2) {
      const fraza = lastWord.toLowerCase();
      const pasujacy = wszyscyPracownicy.filter((p) =>
        p.toLowerCase().startsWith(fraza),
      );
      setPracownicyPodpowiedzi(pasujacy);
      setPokazPodpowiedzi(pasujacy.length > 0);
    } else {
      setPracownicyPodpowiedzi([]);
      setPokazPodpowiedzi(false);
    }
  };

  const wstawOznaczenie = (imie: string) => {
    const words = nowaWiadomosc.split(" ");
    words.pop();
    const nowaWiadomoscGotowa =
      words.join(" ") + (words.length > 0 ? " " : "") + `@${imie} `;
    setNowaWiadomosc(nowaWiadomoscGotowa);
    setPokazPodpowiedzi(false);
    inputRef.current?.focus();
  };

  const renderWiadomosc = ({ item }: { item: any }) => {
    const isSystem =
      item.id_pracownika === "SYSTEM-BOT" || item.rola === "system";
    const toJa = item.id_pracownika === bezpieczneId;

    const isMentioned =
      !toJa &&
      (item.wiadomosc.includes(`@${bezpiecznaNazwa}`) ||
        item.wiadomosc.includes(`@Wszyscy`));

    const dataCzas = new Date(item.utworzono).toLocaleString("pl-PL", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });

    if (isSystem) {
      return (
        <View style={styles.systemContainer}>
          <Text style={styles.systemText}>{item.wiadomosc}</Text>
          <Text style={styles.systemTime}>{dataCzas}</Text>
        </View>
      );
    }

    const reakcje = item.reakcje || {};
    const wpisyReakcji = Object.entries(reakcje);
    const iloscReakcji = wpisyReakcji.length > 0;

    return (
      <View
        // @ts-ignore
        onMouseEnter={() => Platform.OS === "web" && setHoveredMsgId(item.id)}
        // @ts-ignore
        onMouseLeave={() => Platform.OS === "web" && setHoveredMsgId(null)}
        style={[
          styles.wiadomoscWrapper,
          toJa ? styles.wiadomoscWrapperMoja : styles.wiadomoscWrapperInna,
        ]}
      >
        {toJa &&
          Platform.OS === "web" &&
          hoveredMsgId === item.id &&
          aktywnyMenuReakcji !== item.id && (
            <TouchableOpacity
              style={styles.hoverReactionBtn}
              onPress={() => setAktywnyMenuReakcji(item.id)}
            >
              <Text style={styles.hoverReactionIcon}>😀</Text>
            </TouchableOpacity>
          )}

        <View
          style={[
            styles.dymekContainer,
            toJa ? styles.dymekMoj : styles.dymekInny,
          ]}
        >
          {!toJa && (
            <Text style={styles.nadawcaText}>
              {item.nazwa_pracownika}{" "}
              {isMentioned && <Text style={{ color: "#d97706" }}>🔔</Text>}
            </Text>
          )}

          {aktywnyMenuReakcji === item.id && (
            <View
              style={[styles.reactionMenu, toJa ? { right: 0 } : { left: 0 }]}
            >
              {DOSTEPNE_REAKCJE.map((emoji) => (
                <Pressable
                  key={emoji}
                  // @ts-ignore
                  onMouseEnter={() =>
                    Platform.OS === "web" && setHoveredEmoji(emoji)
                  }
                  // @ts-ignore
                  onMouseLeave={() =>
                    Platform.OS === "web" && setHoveredEmoji(null)
                  }
                  style={[
                    styles.reactionMenuBtn,
                    hoveredEmoji === emoji && styles.reactionMenuBtnHovered,
                  ]}
                  onPress={() => toggleReakcja(item.id, item.reakcje, emoji)}
                >
                  <Text style={styles.reactionMenuEmoji}>{emoji}</Text>
                </Pressable>
              ))}
            </View>
          )}

          <Pressable
            onLongPress={() => setAktywnyMenuReakcji(item.id)}
            style={[
              styles.dymek,
              toJa ? styles.dymekTloMoje : styles.dymekTloInne,
              isMentioned && styles.dymekTloWspomniany,
            ]}
          >
            <Text
              style={[
                styles.wiadomoscText,
                toJa ? { color: "#fff" } : { color: "#0f172a" },
                isMentioned && { fontWeight: "bold", color: "#78350f" },
              ]}
            >
              {item.wiadomosc}
            </Text>
          </Pressable>

          {/* NOWY BLOK Z INFORMACJAMI POD DYMKIEM */}
          <View
            style={[
              styles.podpisInformacyjny,
              toJa ? { alignItems: "flex-end" } : { alignItems: "flex-start" },
            ]}
          >
            <Text style={styles.czasText}>{dataCzas}</Text>

            {iloscReakcji && (
              <>
                {/* 1. Licznik klikalny (pokazuje tylko sumę łapek) */}
                <TouchableOpacity
                  style={styles.reakcjePodsumowanieBtn}
                  onPress={() =>
                    setPokazKtoZareagowalId(
                      pokazKtoZareagowalId === item.id ? null : item.id,
                    )
                  }
                >
                  {wpisyReakcji.map(([emoji, users]: any) => (
                    <Text key={emoji} style={styles.reakcjePodsumowanieText}>
                      {emoji} {users.length}
                    </Text>
                  ))}
                </TouchableOpacity>

                {/* 2. Rozwinięte szczegóły (kto dokładnie dał łapkę) */}
                {pokazKtoZareagowalId === item.id && (
                  <View style={styles.reakcjeSzczegolyBox}>
                    {wpisyReakcji.map(([emoji, users]: any) => (
                      <Text key={emoji} style={styles.reakcjeSzczegolyText}>
                        {emoji}:{" "}
                        <Text style={{ color: "#64748b" }}>
                          {users.join(", ")}
                        </Text>
                      </Text>
                    ))}
                  </View>
                )}
              </>
            )}
          </View>
        </View>

        {!toJa &&
          Platform.OS === "web" &&
          hoveredMsgId === item.id &&
          aktywnyMenuReakcji !== item.id && (
            <TouchableOpacity
              style={styles.hoverReactionBtn}
              onPress={() => setAktywnyMenuReakcji(item.id)}
            >
              <Text style={styles.hoverReactionIcon}>😀</Text>
            </TouchableOpacity>
          )}
      </View>
    );
  };

  return (
    <>
      {!isOpen && (
        <TouchableOpacity style={styles.fab} onPress={otworzCzat}>
          <Text style={styles.fabIcon}>💬</Text>
          {nieprzeczytane > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{nieprzeczytane}</Text>
            </View>
          )}
        </TouchableOpacity>
      )}

      {isOpen && (
        <KeyboardAvoidingView
          style={styles.czatOkno}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <View style={styles.czatHeader}>
            <Text style={styles.czatTitle}>💬 Czat Firmowy</Text>
            <TouchableOpacity
              onPress={() => setIsOpen(false)}
              style={styles.closeBtn}
            >
              <Text style={styles.closeBtnText}>✖</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={styles.tloCzyste}
            activeOpacity={1}
            onPress={() => {
              setAktywnyMenuReakcji(null);
              setPokazKtoZareagowalId(null); // Zamknięcie szczegółów po kliknięciu w tło
            }}
          >
            <FlatList
              ref={flatListRef}
              data={wiadomosci}
              keyExtractor={(item) => item.id}
              renderItem={renderWiadomosc}
              contentContainerStyle={styles.listaWiadomosci}
              onContentSizeChange={() =>
                flatListRef.current?.scrollToEnd({ animated: true })
              }
              onLayout={() =>
                flatListRef.current?.scrollToEnd({ animated: true })
              }
            />
          </TouchableOpacity>

          {pokazPodpowiedzi && pracownicyPodpowiedzi.length > 0 && (
            <View style={styles.mentionsContainer}>
              <ScrollView
                style={{ maxHeight: 160 }}
                showsVerticalScrollIndicator={true}
                keyboardShouldPersistTaps="handled"
              >
                {pracownicyPodpowiedzi.map((imie, index) => (
                  <TouchableOpacity
                    key={index}
                    style={styles.mentionListItem}
                    onPress={() => wstawOznaczenie(imie)}
                  >
                    <Text style={styles.mentionListText}>@{imie}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}

          <View style={styles.inputContainer}>
            <TextInput
              ref={inputRef}
              style={styles.input}
              placeholder="Napisz wiadomość..."
              value={nowaWiadomosc}
              onChangeText={handleTextChange}
              onSubmitEditing={wyslijWiadomosc}
              returnKeyType="send"
              onFocus={() => {
                setAktywnyMenuReakcji(null);
                setPokazKtoZareagowalId(null);
              }}
            />
            <TouchableOpacity style={styles.sendBtn} onPress={wyslijWiadomosc}>
              <Text style={styles.sendBtnText}>➤</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: "absolute",
    bottom: 30,
    right: 30,
    backgroundColor: "#2563eb",
    width: 65,
    height: 65,
    borderRadius: 35,
    justifyContent: "center",
    alignItems: "center",
    elevation: 8,
    shadowColor: "#000",
    shadowOpacity: 0.3,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 5,
    zIndex: 9999,
  },
  fabIcon: { fontSize: 30 },
  badge: {
    position: "absolute",
    top: -5,
    right: -5,
    backgroundColor: "#ef4444",
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#fff",
  },
  badgeText: { color: "#fff", fontSize: 12, fontWeight: "bold" },

  czatOkno: {
    position: "absolute",
    bottom: 30,
    right: 30,
    width: 350,
    height: 500,
    backgroundColor: "#f8fafc",
    borderRadius: 20,
    elevation: 10,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowOffset: { width: 0, height: 5 },
    shadowRadius: 10,
    zIndex: 9999,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  czatHeader: {
    backgroundColor: "#1e293b",
    padding: 15,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  czatTitle: { color: "#fff", fontSize: 16, fontWeight: "bold" },
  closeBtn: { padding: 5 },
  closeBtnText: { color: "#fff", fontSize: 16, fontWeight: "bold" },

  tloCzyste: { flex: 1 },
  listaWiadomosci: { padding: 15, paddingBottom: 20 },

  systemContainer: {
    alignItems: "center",
    marginVertical: 15,
    paddingHorizontal: 20,
  },
  systemText: {
    fontSize: 11,
    color: "#64748b",
    textAlign: "center",
    backgroundColor: "#f1f5f9",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    overflow: "hidden",
    fontWeight: "600",
  },
  systemTime: {
    fontSize: 9,
    color: "#94a3b8",
    marginTop: 4,
  },

  wiadomoscWrapper: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 15,
  },
  wiadomoscWrapperMoja: { justifyContent: "flex-end" },
  wiadomoscWrapperInna: { justifyContent: "flex-start" },

  hoverReactionBtn: {
    padding: 8,
    marginHorizontal: 8,
    marginTop: 10,
    backgroundColor: "#f1f5f9",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  hoverReactionIcon: { fontSize: 16 },

  dymekContainer: { maxWidth: "85%", position: "relative" },
  dymekMoj: { alignSelf: "flex-end" },
  dymekInny: { alignSelf: "flex-start" },
  nadawcaText: {
    fontSize: 11,
    color: "#64748b",
    marginBottom: 4,
    marginLeft: 5,
    fontWeight: "bold",
  },
  dymek: { padding: 12, borderRadius: 16, minWidth: 50 },
  dymekTloMoje: { backgroundColor: "#2563eb", borderBottomRightRadius: 2 },
  dymekTloInne: { backgroundColor: "#e2e8f0", borderBottomLeftRadius: 2 },
  dymekTloWspomniany: {
    backgroundColor: "#fef08a",
    borderWidth: 2,
    borderColor: "#f59e0b",
    borderBottomLeftRadius: 2,
  },
  wiadomoscText: { fontSize: 14 },

  reactionMenu: {
    position: "absolute",
    top: -45,
    flexDirection: "row",
    backgroundColor: "#fff",
    borderRadius: 25,
    paddingHorizontal: 5,
    paddingVertical: 5,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 8,
    elevation: 5,
    zIndex: 100,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  reactionMenuBtn: {
    paddingHorizontal: 8,
    paddingVertical: 6,
    marginHorizontal: 2,
    borderRadius: 15,
  },
  reactionMenuBtnHovered: {
    backgroundColor: "#e2e8f0",
  },
  reactionMenuEmoji: { fontSize: 22 },

  // --- ZMIANA: NOWE STYLE DLA PODPISU I REAKCJI ---
  podpisInformacyjny: {
    marginTop: 4,
    paddingHorizontal: 4,
    flexDirection: "column",
  },
  czasText: {
    fontSize: 10,
    color: "#94a3b8",
    marginBottom: 4,
  },
  reakcjePodsumowanieBtn: {
    flexDirection: "row",
    backgroundColor: "#f1f5f9",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  reakcjePodsumowanieText: {
    fontSize: 11,
    fontWeight: "bold",
    color: "#475569",
    marginHorizontal: 3,
  },
  reakcjeSzczegolyBox: {
    marginTop: 4,
    backgroundColor: "#f8fafc",
    padding: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  reakcjeSzczegolyText: {
    fontSize: 10,
    color: "#334155",
    fontWeight: "600",
    marginBottom: 2,
  },

  mentionsContainer: {
    backgroundColor: "#fff",
    borderTopWidth: 1,
    borderTopColor: "#e2e8f0",
  },
  mentionListItem: {
    paddingVertical: 12,
    paddingHorizontal: 15,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
    backgroundColor: "#f8fafc",
  },
  mentionListText: {
    color: "#2563eb",
    fontWeight: "bold",
    fontSize: 15,
  },

  inputContainer: {
    flexDirection: "row",
    padding: 10,
    backgroundColor: "#fff",
    borderTopWidth: 1,
    borderTopColor: "#e2e8f0",
  },
  input: {
    flex: 1,
    backgroundColor: "#f1f5f9",
    borderRadius: 20,
    paddingHorizontal: 15,
    paddingVertical: 10,
    fontSize: 14,
    marginRight: 10,
  },
  sendBtn: {
    backgroundColor: "#2563eb",
    width: 45,
    height: 45,
    borderRadius: 25,
    justifyContent: "center",
    alignItems: "center",
  },
  sendBtnText: { color: "#fff", fontSize: 18, fontWeight: "bold" },
});
