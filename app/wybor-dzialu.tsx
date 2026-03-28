import { useLocalSearchParams, useRouter } from "expo-router";
import React from "react";
import {
    Platform,
    SafeAreaView,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import { supabase } from "../supabase";

export default function WyborDzialuScreen() {
  const router = useRouter();
  const { idPracownika, nazwaPracownika, rola } = useLocalSearchParams();

  const przejdzNaDzial = async (sciezka: any, nazwaDzialu: string) => {
    // Zabezpieczenie parametrów przed formatem tablicowym
    const bezpieczneId = Array.isArray(idPracownika)
      ? idPracownika[0]
      : idPracownika;
    const bezpiecznaNazwa = Array.isArray(nazwaPracownika)
      ? nazwaPracownika[0]
      : nazwaPracownika;
    const bezpiecznaRola = Array.isArray(rola) ? rola[0] : rola;

    // --- 1. WYSŁANIE CICHEJ WIADOMOŚCI ---
    try {
      await supabase.from("czat_kadra").insert([
        {
          id_pracownika: bezpieczneId, // Używamy PRAWDZIWEGO ID, żeby uniknąć błędu 400!
          nazwa_pracownika: "🤖 BOT SYSTEMOWY", // Ale zmieniamy wyświetlaną nazwę
          rola: "system",
          wiadomosc: `⚠️ UWAGA: ${bezpiecznaNazwa} rozpoczął pracę na dziale: ${nazwaDzialu}`,
        },
      ]);
    } catch (error) {
      console.log("Błąd wysyłania logu na czat", error);
    }

    // --- 2. PRZEKIEROWANIE PRACOWNIKA ---
    router.replace({
      pathname: sciezka,
      params: {
        idPracownika: bezpieczneId,
        nazwaPracownika: bezpiecznaNazwa,
        rola: bezpiecznaRola,
      },
    });
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Wybór Stanowiska</Text>
        <Text style={styles.subtitle}>Pracownik: {nazwaPracownika}</Text>
        <Text style={styles.info}>
          Wybierz dział, na którym będziesz teraz pracować.
        </Text>
      </View>

      <ScrollView contentContainerStyle={styles.grid}>
        <TouchableOpacity
          style={[styles.card, { borderLeftColor: "#3b82f6" }]}
          onPress={() => przejdzNaDzial("/hala-krojownia", "KROJOWNIA")}
        >
          <Text style={styles.icon}>✂️</Text>
          <View>
            <Text style={styles.cardTitle}>KROJOWNIA</Text>
            <Text style={styles.cardSub}>Cięcie materiałów</Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.card, { borderLeftColor: "#ec4899" }]}
          onPress={() => przejdzNaDzial("/hala-szwalnia", "SZWALNIA")}
        >
          <Text style={styles.icon}>🧵</Text>
          <View>
            <Text style={styles.cardTitle}>SZWALNIA</Text>
            <Text style={styles.cardSub}>Szycie pokrowców</Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.card, { borderLeftColor: "#10b981" }]}
          onPress={() => przejdzNaDzial("/hala-ubieralnia", "UBIERALNIA")}
        >
          <Text style={styles.icon}>🛏️</Text>
          <View>
            <Text style={styles.cardTitle}>UBIERALNIA</Text>
            <Text style={styles.cardSub}>Montaż materacy</Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.card, { borderLeftColor: "#f59e0b" }]}
          onPress={() => przejdzNaDzial("/hala-pikowanie", "PIKOWANIE")}
        >
          <Text style={styles.icon}>🪡</Text>
          <View>
            <Text style={styles.cardTitle}>PIKOWANIE</Text>
            <Text style={styles.cardSub}>Pikowanie pokrowców</Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.card, { borderLeftColor: "#8b5cf6" }]}
          onPress={() => przejdzNaDzial("/magazyn-wysylka", "MAGAZYN")}
        >
          <Text style={styles.icon}>📦</Text>
          <View>
            <Text style={styles.cardTitle}>MAGAZYN</Text>
            <Text style={styles.cardSub}>Wysyłka i pakowanie</Text>
          </View>
        </TouchableOpacity>
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity
          style={styles.cancelBtn}
          onPress={() => router.back()}
        >
          <Text style={styles.cancelBtnText}>⬅️ WRÓĆ DO SWOJEGO DZIAŁU</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f8fafc" },
  header: {
    padding: 25,
    paddingTop: Platform.OS === "ios" ? 20 : 40,
    backgroundColor: "#0f172a",
    borderBottomLeftRadius: 30,
    borderBottomRightRadius: 30,
    alignItems: "center",
    elevation: 10,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 10,
  },
  title: { fontSize: 28, fontWeight: "900", color: "#ffffff" },
  subtitle: {
    fontSize: 16,
    color: "#38bdf8",
    fontWeight: "bold",
    marginTop: 5,
  },
  info: { fontSize: 13, color: "#94a3b8", marginTop: 10, textAlign: "center" },

  grid: {
    padding: 20,
    paddingTop: 30,
    alignItems: "center",
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#ffffff",
    width: "100%",
    maxWidth: 500,
    padding: 20,
    borderRadius: 16,
    marginBottom: 15,
    borderLeftWidth: 8,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 5,
    elevation: 3,
  },
  icon: {
    fontSize: 40,
    marginRight: 20,
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: "900",
    color: "#1e293b",
  },
  cardSub: {
    fontSize: 14,
    color: "#64748b",
    marginTop: 2,
  },
  footer: {
    padding: 20,
    backgroundColor: "#ffffff",
    borderTopWidth: 1,
    borderTopColor: "#e2e8f0",
    alignItems: "center",
  },
  cancelBtn: {
    backgroundColor: "#e2e8f0",
    padding: 15,
    borderRadius: 12,
    width: "100%",
    maxWidth: 400,
    alignItems: "center",
  },
  cancelBtnText: {
    color: "#334155",
    fontSize: 16,
    fontWeight: "bold",
  },
});
