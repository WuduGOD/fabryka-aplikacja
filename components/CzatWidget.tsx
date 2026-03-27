import React, { useEffect, useRef, useState } from "react";
import {
    FlatList,
    KeyboardAvoidingView,
    Platform,
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

export default function CzatWidget({
  idPracownika,
  nazwaPracownika,
  rola,
}: CzatWidgetProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [wiadomosci, setWiadomosci] = useState<any[]>([]);
  const [nowaWiadomosc, setNowaWiadomosc] = useState("");
  const [nieprzeczytane, setNieprzeczytane] = useState(0);

  const flatListRef = useRef<FlatList>(null);

  // Bezpieczne parsowanie propsów (bo z expo-router mogą przyjść jako tablice)
  const bezpieczneId = Array.isArray(idPracownika)
    ? idPracownika[0]
    : idPracownika;
  const bezpiecznaNazwa = Array.isArray(nazwaPracownika)
    ? nazwaPracownika[0]
    : nazwaPracownika;
  const bezpiecznaRola = Array.isArray(rola) ? rola[0] : rola;

  useEffect(() => {
    pobierzWiadomosci();

    // Nasłuch na nowe wiadomości w czasie rzeczywistym
    const subskrypcja = supabase
      .channel("public:czat_kadra")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "czat_kadra" },
        (payload) => {
          const nowa = payload.new;
          setWiadomosci((prev) => [...prev, nowa]);

          // Jeśli czat jest zamknięty i ktoś inny napisał -> dodajemy powiadomienie
          if (!isOpen && nowa.id_pracownika !== bezpieczneId) {
            setNieprzeczytane((prev) => prev + 1);
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(subskrypcja);
    };
  }, [isOpen]); // Reagujemy też na otwarcie okna

  const pobierzWiadomosci = async () => {
    const { data, error } = await supabase
      .from("czat_kadra")
      .select("*")
      .order("utworzono", { ascending: true }) // Najstarsze na górze, najnowsze na dole
      .limit(50); // Pobieramy ostatnie 50 wiadomości dla wydajności

    if (data) {
      setWiadomosci(data);
    }
  };

  const wyslijWiadomosc = async () => {
    if (!nowaWiadomosc.trim()) return;

    const tekst = nowaWiadomosc.trim();
    setNowaWiadomosc(""); // Czyścimy input od razu (optimistic UI)

    await supabase.from("czat_kadra").insert([
      {
        id_pracownika: bezpieczneId,
        nazwa_pracownika: bezpiecznaNazwa || "Nieznany",
        rola: bezpiecznaRola || "brak",
        wiadomosc: tekst,
      },
    ]);
  };

  const otworzCzat = () => {
    setIsOpen(true);
    setNieprzeczytane(0); // Zerujemy licznik powiadomień po otwarciu
  };

  const renderWiadomosc = ({ item }: { item: any }) => {
    const toJa = item.id_pracownika === bezpieczneId;
    const czas = new Date(item.utworzono).toLocaleTimeString("pl-PL", {
      hour: "2-digit",
      minute: "2-digit",
    });

    return (
      <View
        style={[
          styles.dymekContainer,
          toJa ? styles.dymekMoj : styles.dymekInny,
        ]}
      >
        {!toJa && (
          <Text style={styles.nadawcaText}>{item.nazwa_pracownika}</Text>
        )}
        <View
          style={[
            styles.dymek,
            toJa ? styles.dymekTloMoje : styles.dymekTloInne,
          ]}
        >
          <Text
            style={[
              styles.wiadomoscText,
              toJa ? { color: "#fff" } : { color: "#0f172a" },
            ]}
          >
            {item.wiadomosc}
          </Text>
        </View>
        <Text style={styles.czasText}>{czas}</Text>
      </View>
    );
  };

  return (
    <>
      {/* PŁYWAJĄCA IKONA (FAB) */}
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

      {/* OKNO CZATU */}
      {isOpen && (
        <KeyboardAvoidingView
          style={styles.czatOkno}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <View style={styles.czatHeader}>
            <Text style={styles.czatTitle}>💬 Czat Kadry</Text>
            <TouchableOpacity
              onPress={() => setIsOpen(false)}
              style={styles.closeBtn}
            >
              <Text style={styles.closeBtnText}>✖</Text>
            </TouchableOpacity>
          </View>

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

          <View style={styles.inputContainer}>
            <TextInput
              style={styles.input}
              placeholder="Napisz wiadomość..."
              value={nowaWiadomosc}
              onChangeText={setNowaWiadomosc}
              onSubmitEditing={wyslijWiadomosc}
              returnKeyType="send"
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
  // --- Przycisk Pływający ---
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

  // --- Okno Czatu ---
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

  listaWiadomosci: { padding: 15, paddingBottom: 20 },

  dymekContainer: { marginBottom: 15, maxWidth: "85%" },
  dymekMoj: { alignSelf: "flex-end" },
  dymekInny: { alignSelf: "flex-start" },
  nadawcaText: {
    fontSize: 11,
    color: "#64748b",
    marginBottom: 4,
    marginLeft: 5,
  },
  dymek: { padding: 12, borderRadius: 16 },
  dymekTloMoje: { backgroundColor: "#2563eb", borderBottomRightRadius: 2 },
  dymekTloInne: { backgroundColor: "#e2e8f0", borderBottomLeftRadius: 2 },
  wiadomoscText: { fontSize: 14 },
  czasText: {
    fontSize: 10,
    color: "#94a3b8",
    marginTop: 4,
    alignSelf: "flex-end",
    marginRight: 5,
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
