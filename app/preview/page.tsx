import { TripDashboard } from "@/components/TripDashboard";
import type { TripWithDays } from "@/types";

/**
 * Design preview: renders the trip dashboard from mock data so the UI can be
 * seen and iterated on before a database is connected. Safe to delete once
 * /trips/[id] is backed by real data.
 */

const T = "2026-06-20T10:00:00.000Z"; // shared createdAt/updatedAt for mock rows

function day(
  id: string,
  date: string,
  activities: TripWithDays["days"][number]["activities"],
): TripWithDays["days"][number] {
  return {
    id,
    date: `${date}T00:00:00.000Z`,
    tripId: "demo-trip",
    createdAt: T,
    updatedAt: T,
    activities,
  };
}

function activity(
  id: string,
  tripDayId: string,
  data: {
    title: string;
    time?: string | null;
    description?: string | null;
    locationName?: string | null;
    latitude?: number | null;
    longitude?: number | null;
    cost?: number | null;
  },
): TripWithDays["days"][number]["activities"][number] {
  return {
    id,
    tripDayId,
    title: data.title,
    description: data.description ?? null,
    time: data.time ?? null,
    locationName: data.locationName ?? null,
    latitude: data.latitude ?? null,
    longitude: data.longitude ?? null,
    cost: data.cost ?? null,
    createdAt: T,
    updatedAt: T,
  };
}

const mockTrip: TripWithDays = {
  id: "demo-trip",
  title: "Lisbon & the Algarve",
  destination: "Portugal",
  startDate: "2026-09-12T00:00:00.000Z",
  endDate: "2026-09-18T00:00:00.000Z",
  windowStart: null,
  windowEnd: null,
  durationDays: null,
  totalBudget: 2000,
  currency: "EUR",
  createdAt: T,
  updatedAt: T,
  members: [
    {
      id: "member-1",
      role: "OWNER",
      userId: "user-maya",
      tripId: "demo-trip",
      user: {
        id: "user-maya",
        name: "Maya",
        email: "maya@example.com",
        image: null,
      },
    },
    {
      id: "member-2",
      role: "EDITOR",
      userId: "user-jonas",
      tripId: "demo-trip",
      user: {
        id: "user-jonas",
        name: "Jonas",
        email: "jonas@example.com",
        image: null,
      },
    },
  ],
  days: [
    day("day-1", "2026-09-12", [
      activity("act-1", "day-1", {
        title: "Flight TAP 1234 to Lisbon",
        time: "2026-09-12T09:40:00.000Z",
        description: "Departs 09:40 from Terminal 1. Seats 14A–14D.",
        locationName: "Lisbon Airport (LIS)",
        cost: 240,
      }),
      activity("act-2", "day-1", {
        title: "Check in — Alfama apartment",
        time: "2026-09-12T15:00:00.000Z",
        description: "6 nights, rooftop terrace. Door code in the group chat.",
        locationName: "Alfama, Lisbon",
        latitude: 38.7118,
        longitude: -9.1247,
        cost: 390,
      }),
      activity("act-3", "day-1", {
        title: "Dinner at Time Out Market",
        time: "2026-09-12T19:30:00.000Z",
        locationName: "Mercado da Ribeira",
        cost: 45,
      }),
    ]),
    day("day-2", "2026-09-13", [
      activity("act-4", "day-2", {
        title: "Train to Sintra",
        time: "2026-09-13T08:30:00.000Z",
        description: "From Rossio station — buy the combined Sintra day ticket.",
        locationName: "Rossio Station",
        cost: 16,
      }),
      activity("act-5", "day-2", {
        title: "Pena Palace & gardens",
        time: "2026-09-13T10:30:00.000Z",
        description:
          "Timed entry at 10:30. The walk up from the gate takes ~20 minutes, or take the shuttle.",
        locationName: "Sintra",
        latitude: 38.7876,
        longitude: -9.3904,
        cost: 28,
      }),
      activity("act-6", "day-2", {
        title: "Pastéis de Belém",
        description: "Skip-the-line tip: the sit-down queue moves faster.",
        locationName: "Belém, Lisbon",
        cost: 12,
      }),
    ]),
    day("day-3", "2026-09-14", []),
    day("day-4", "2026-09-15", [
      activity("act-7", "day-4", {
        title: "Pick up rental car",
        time: "2026-09-15T09:00:00.000Z",
        description: "Compact automatic, drop-off in Faro on the 18th.",
        locationName: "Lisbon Airport (LIS)",
        cost: 180,
      }),
      activity("act-8", "day-4", {
        title: "Drive south to Lagos",
        time: "2026-09-15T10:00:00.000Z",
        description: "~3h via the A2, lunch stop in Setúbal.",
        cost: 60,
      }),
      activity("act-9", "day-4", {
        title: "Sunset at Praia Dona Ana",
        locationName: "Lagos",
        latitude: 37.0916,
        longitude: -8.667,
      }),
    ]),
    day("day-5", "2026-09-16", [
      activity("act-10", "day-5", {
        title: "Benagil caves kayak tour",
        time: "2026-09-16T09:00:00.000Z",
        description: "2h guided paddle — bring the dry bag for phones.",
        locationName: "Benagil",
        cost: 70,
      }),
      activity("act-11", "day-5", {
        title: "Seafood lunch at O Camilo",
        time: "2026-09-16T13:00:00.000Z",
        locationName: "Lagos",
        cost: 55,
      }),
      activity("act-12", "day-5", {
        title: "Cape St. Vincent lighthouse",
        time: "2026-09-16T19:00:00.000Z",
        description: "Westernmost point of mainland Europe — stay for sunset.",
        locationName: "Sagres",
      }),
    ]),
    day("day-6", "2026-09-17", [
      activity("act-13", "day-6", {
        title: "Morning at Mercado de Olhão",
        description: "Pick up peri-peri, tinned fish and flor de sal to bring home.",
        locationName: "Olhão",
        cost: 25,
      }),
      activity("act-14", "day-6", {
        title: "Cataplana cooking class",
        time: "2026-09-17T17:00:00.000Z",
        locationName: "Faro old town",
        cost: 85,
      }),
    ]),
    day("day-7", "2026-09-18", [
      activity("act-15", "day-7", {
        title: "Airport transfer & flight home",
        time: "2026-09-18T12:20:00.000Z",
        description: "Return the car by 10:30, flight at 12:20.",
        locationName: "Faro Airport (FAO)",
        cost: 35,
      }),
    ]),
  ],
};

export default function PreviewPage() {
  // OWNER so owner-only UI (e.g. the Share button) is visible in the demo.
  // Tabs are hidden because the mock trip has no real routes behind them.
  return (
    <TripDashboard trip={mockTrip} currentUserRole="OWNER" showTabs={false} />
  );
}
