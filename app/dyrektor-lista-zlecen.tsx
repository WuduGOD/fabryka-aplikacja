import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import CzatWidget from "../components/CzatWidget";
import { supabase } from "../supabase";

// ZMIANA: Zmieniona nazwa głównej funkcji!
export default function DyrektorListaZlecenScreen() {
  const router = useRouter();
  const [zlecenia, setZlecenia] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const { idPracownika, nazwaPracownika } = useLocalSearchParams();

  useEffect(() => {
    fetchZlecenia();
  }, []);

  const fetchZlecenia = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("zlecenia")
        .select("*")
        .order("utworzono", { ascending: false });

      if (error) console.error("Błąd pobierania:", error);
      else if (data) setZlecenia(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "nowe":
        return "#3b82f6";
      case "krojenie_w_trakcie":
        return "#f59e0b";
      case "gotowe_do_szycia":
        return "#8b5cf6";
      case "szycie_w_trakcie":
        return "#ec4899";
      case "do_kontroli":
        return "#eab308";
      case "do_poprawki":
        return "#ef4444";
      case "zrealizowane":
        return "#10b981";
      default:
        return "#64748b";
    }
  };

  const formatStatusText = (status: string) => {
    if (!status) return "NIEZNANY";
    return status.replace(/_/g, " ").toUpperCase();
  };

  const renderItem = ({ item }: { item: any }) => {
    const dataDodania = new Date(item.utworzono).toLocaleString("pl-PL", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });

    return (
      <TouchableOpacity
        style={styles.zlecenieCard}
        onPress={() =>
          router.push({
            pathname: "/biuro-zlecenie-detale",
            params: { id: item.id },
          })
        }
      >
        <View style={styles.zlecenieHeader}>
          <Text style={styles.numerZD}>{item.numer_zd}</Text>
          <Text style={styles.chevronIcon}>›</Text>
        </View>

        <View style={styles.zlecenieMeta}>
          <View
            style={[
              styles.statusBadge,
              { backgroundColor: getStatusColor(item.status) },
            ]}
          >
            <Text style={styles.statusText}>
              {formatStatusText(item.status)}
            </Text>
          </View>
          <Text style={styles.dataText}>Wprowadzono: {dataDodania}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  const filteredZlecenia = zlecenia.filter((zlecenie) =>
    zlecenie.numer_zd.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Podgląd Zleceń</Text>
        <Text style={styles.subtitle}>
          Lista zleceń na produkcji (Dyrektor)
        </Text>
      </View>

      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="🔍 Szukaj numeru ZD..."
          placeholderTextColor="#94a3b8"
          value={searchQuery}
          onChangeText={setSearchQuery}
          clearButtonMode="while-editing"
        />
      </View>

      {loading ? (
        <ActivityIndicator
          size="large"
          color="#0f172a"
          style={{ marginTop: 50 }}
        />
      ) : (
        <FlatList
          data={filteredZlecenia}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContainer}
          showsVerticalScrollIndicator={false}
          onRefresh={fetchZlecenia}
          refreshing={loading}
          ListEmptyComponent={
            <Text style={styles.emptyText}>
              {searchQuery
                ? "Nie znaleziono zlecenia o takim numerze."
                : "Brak zleceń w bazie."}
            </Text>
          }
        />
      )}

      <View style={styles.footer}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <Text style={styles.buttonText}>WRÓĆ DO MENU</Text>
        </TouchableOpacity>
      </View>
      <CzatWidget
        idPracownika={idPracownika}
        nazwaPracownika={nazwaPracownika}
        rola={"dyrektor"}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#eef2f6", paddingTop: 60 },
  header: { alignItems: "center", marginBottom: 15, paddingHorizontal: 20 },
  title: { fontSize: 28, fontWeight: "900", color: "#0f172a", marginBottom: 5 },
  subtitle: { fontSize: 16, color: "#64748b" },
  searchContainer: {
    paddingHorizontal: 20,
    marginBottom: 15,
    width: "100%",
    maxWidth: 600,
    alignSelf: "center",
  },
  searchInput: {
    backgroundColor: "#ffffff",
    borderRadius: 12,
    padding: 15,
    fontSize: 16,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    color: "#0f172a",
  },
  listContainer: { paddingHorizontal: 20, paddingBottom: 100 },
  zlecenieCard: {
    width: "100%",
    backgroundColor: "#ffffff",
    borderRadius: 12,
    padding: 20,
    marginBottom: 15,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 5,
    elevation: 2,
  },
  zlecenieHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  numerZD: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#0f172a",
    flex: 1,
    marginRight: 10,
  },
  chevronIcon: { fontSize: 26, color: "#94a3b8", fontWeight: "bold" },
  zlecenieMeta: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  statusBadge: { paddingVertical: 5, paddingHorizontal: 12, borderRadius: 20 },
  statusText: { color: "#ffffff", fontSize: 11, fontWeight: "bold" },
  dataText: { fontSize: 13, color: "#64748b" },
  emptyText: {
    textAlign: "center",
    color: "#64748b",
    marginTop: 50,
    fontSize: 16,
  },
  footer: { padding: 20, alignItems: "center", backgroundColor: "#eef2f6" },
  backButton: {
    backgroundColor: "#64748b",
    padding: 15,
    borderRadius: 12,
    width: "100%",
    maxWidth: 300,
    alignItems: "center",
  },
  buttonText: { color: "#ffffff", fontSize: 16, fontWeight: "bold" },
});
