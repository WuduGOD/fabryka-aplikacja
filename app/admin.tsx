import { useLocalSearchParams, useRouter } from "expo-router";
import React from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import CzatWidget from "../components/CzatWidget";

export default function AdminHubScreen() {
  const router = useRouter();
  const { idPracownika, nazwaPracownika, rola } = useLocalSearchParams();

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Centrum Dowodzenia</Text>
        <Text style={styles.subtitle}>
          Wybierz moduł, którym chcesz zarządzać
        </Text>
      </View>

      <ScrollView
        style={styles.scrollArea}
        contentContainerStyle={styles.grid}
        showsVerticalScrollIndicator={false}
      >
        {/* KAFELEK 1: Wprowadzanie (z zielonym paskiem) */}
        <TouchableOpacity
          style={[styles.card, { borderTopColor: "#10b981" }]}
          onPress={() => router.push("/admin-zlecenia")}
        >
          <Text style={styles.cardIcon}>📦</Text>
          <Text style={styles.cardTitle}>Wprowadzanie Zleceń</Text>
          <Text style={styles.cardDesc}>
            Skanuj kody z Subiekta i wpuszczaj zlecenia na produkcję.
          </Text>
        </TouchableOpacity>

        {/* KAFELEK 2: Podgląd (TERAZ PONIŻEJ WPISYWANIA, z pomarańczowym paskiem) */}
        <TouchableOpacity
          style={[styles.card, { borderTopColor: "#f59e0b" }]}
          onPress={() => router.push("/admin-podglad")}
        >
          <Text style={styles.cardIcon}>📋</Text>
          <Text style={styles.cardTitle}>Podgląd Zleceń</Text>
          <Text style={styles.cardDesc}>
            Śledź statusy zleceń na produkcji w czasie rzeczywistym i zobacz
            historię.
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.card, { borderTopColor: "#3b82f6" }]}
          onPress={() => router.push("/admin-pracownicy")}
        >
          <Text style={styles.cardIcon}>👥</Text>
          <Text style={styles.cardTitle}>Kadry i Pracownicy</Text>
          <Text style={styles.cardDesc}>
            Dodawaj nowych pracowników, zarządzaj PIN-ami i rolami.
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.card, { borderTopColor: "#8b5cf6" }]}
          onPress={() => router.push("/admin-analityka")}
        >
          <Text style={styles.cardIcon}>📊</Text>
          <Text style={styles.cardTitle}>Analityka i Raporty</Text>
          <Text style={styles.cardDesc}>
            Śledź czas pracy, wydajność szwalni i statusy na żywo.
          </Text>
        </TouchableOpacity>
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity
          style={[
            styles.logoutButton,
            { backgroundColor: "#3b82f6", marginBottom: 10 },
          ]}
          onPress={() =>
            router.push({
              pathname: "/wybor-dzialu",
              params: { idPracownika, nazwaPracownika, rola },
            })
          }
        >
          <Text style={styles.buttonText}>🔄 ZMIEŃ DZIAŁ (ZASTĘPSTWO)</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.logoutButton}
          onPress={() => router.replace("/")}
        >
          <Text style={styles.buttonText}>ZAKOŃCZ ZMIANĘ (WYLOGUJ)</Text>
        </TouchableOpacity>
      </View>
      <CzatWidget
        idPracownika={idPracownika}
        nazwaPracownika={nazwaPracownika}
        rola={"admin"}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#eef2f6", paddingTop: 60 },
  header: { alignItems: "center", marginBottom: 20, paddingHorizontal: 20 },
  title: {
    fontSize: 28,
    fontWeight: "900",
    color: "#0f172a",
    marginBottom: 5,
    textAlign: "center",
  },
  subtitle: { fontSize: 16, color: "#64748b", textAlign: "center" },
  scrollArea: { flex: 1, width: "100%" },
  grid: { alignItems: "center", paddingHorizontal: 20, paddingBottom: 100 },
  card: {
    width: "100%",
    maxWidth: 500,
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 24,
    marginBottom: 20,
    borderTopWidth: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 3,
  },
  cardIcon: { fontSize: 32, marginBottom: 10 },
  cardTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#0f172a",
    marginBottom: 8,
  },
  cardDesc: { fontSize: 14, color: "#64748b", lineHeight: 20 },
  footer: { padding: 20, alignItems: "center", backgroundColor: "#eef2f6" },
  logoutButton: {
    backgroundColor: "#ef4444",
    padding: 15,
    borderRadius: 12,
    width: "100%",
    maxWidth: 300,
    alignItems: "center",
  },
  buttonText: { color: "#ffffff", fontSize: 16, fontWeight: "bold" },
});
