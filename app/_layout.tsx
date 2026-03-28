import * as Network from "expo-network";
import { Stack } from "expo-router";
import { useEffect } from "react";
import { SyncManager } from "../components/SyncManager"; // <-- Zwróć uwagę na ścieżkę (components)

export default function RootLayout() {
  // === GLOBALNY KURIER OFFLINE (Działa cicho w tle) ===
  useEffect(() => {
    const timer = setInterval(async () => {
      try {
        const netInfo = await Network.getNetworkStateAsync();
        const mamyNeta = netInfo.isConnected && netInfo.isInternetReachable;

        const iloscWklejce = await SyncManager.pobierzIloscWklejce();

        // Jeśli wrócił internet i mamy coś w schowku -> wysyłamy!
        if (mamyNeta && iloscWklejce > 0) {
          console.log(
            `Internet jest! Wysyłam ${iloscWklejce} zaległych skanów w tle...`,
          );
          await SyncManager.wyslijZalegle();
        }
      } catch (error) {
        console.log("Błąd Kuriera w tle:", error);
      }
    }, 5000); // Rytm sprawdzania co 5 sekund

    // Sprzątanie po wyłączeniu aplikacji
    return () => clearInterval(timer);
  }, []);
  // ====================================================

  return (
    // Stack to nawigacja, gdzie ekrany nakładają się na siebie (bez dolnego paska)
    <Stack screenOptions={{ headerShown: false }}>
      {/* headerShown: false ukrywa brzydki górny pasek z nazwą pliku */}
      <Stack.Screen name="index" />
      <Stack.Screen name="dashboard" />
    </Stack>
  );
}
