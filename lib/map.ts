import { estimateFareMRU } from "@/lib/utils";
import { Driver, MarkerData } from "@/types/type";

const directionsAPI = process.env.EXPO_PUBLIC_DIRECTIONS_API_KEY;

export const generateMarkersFromData = ({
  data,
  userLatitude,
  userLongitude,
}: {
  data: Driver[];
  userLatitude: number;
  userLongitude: number;
}): MarkerData[] => {
  return data.map((driver) => {
    const latOffset = (Math.random() - 0.5) * 0.01;
    const lngOffset = (Math.random() - 0.5) * 0.01;

    return {
      latitude: userLatitude + latOffset,
      longitude: userLongitude + lngOffset,
      title: `${driver.first_name} ${driver.last_name}`,
      ...driver,
    };
  });
};

export const calculateRegion = ({
  userLatitude,
  userLongitude,
  destinationLatitude,
  destinationLongitude,
}: {
  userLatitude: number | null;
  userLongitude: number | null;
  destinationLatitude?: number | null;
  destinationLongitude?: number | null;
}) => {
  if (!userLatitude || !userLongitude) {
    return {
      latitude: 18.0858,
      longitude: -15.9785,
      latitudeDelta: 0.05,
      longitudeDelta: 0.05,
    };
  }

  if (!destinationLatitude || !destinationLongitude) {
    return {
      latitude: userLatitude,
      longitude: userLongitude,
      latitudeDelta: 0.01,
      longitudeDelta: 0.01,
    };
  }

  const minLat = Math.min(userLatitude, destinationLatitude);
  const maxLat = Math.max(userLatitude, destinationLatitude);
  const minLng = Math.min(userLongitude, destinationLongitude);
  const maxLng = Math.max(userLongitude, destinationLongitude);

  const latitudeDelta = (maxLat - minLat) * 1.3;
  const longitudeDelta = (maxLng - minLng) * 1.3;

  const latitude = (userLatitude + destinationLatitude) / 2;
  const longitude = (userLongitude + destinationLongitude) / 2;

  return {
    latitude,
    longitude,
    latitudeDelta,
    longitudeDelta,
  };
};

const getDurationSeconds = (data: any): number | null => {
  const duration = data?.routes?.[0]?.legs?.[0]?.duration?.value;
  return typeof duration === "number" ? duration : null;
};

const getDistanceMeters = (data: any): number | null => {
  const distance = data?.routes?.[0]?.legs?.[0]?.distance?.value;
  return typeof distance === "number" ? distance : null;
};

export const calculateDriverTimes = async ({
  markers,
  userLatitude,
  userLongitude,
  destinationLatitude,
  destinationLongitude,
}: {
  markers: MarkerData[];
  userLatitude: number | null;
  userLongitude: number | null;
  destinationLatitude: number | null;
  destinationLongitude: number | null;
}) => {
  if (
    !userLatitude ||
    !userLongitude ||
    !destinationLatitude ||
    !destinationLongitude
  )
    return [];

  const results: (MarkerData | null)[] = await Promise.all(
    markers.map(async (marker) => {
      try {
        const responseToUser = await fetch(
          `https://maps.googleapis.com/maps/api/directions/json?origin=${marker.latitude},${marker.longitude}&destination=${userLatitude},${userLongitude}&key=${directionsAPI}`,
        );
        const dataToUser = await responseToUser.json();
        const timeToUser = getDurationSeconds(dataToUser);
        if (timeToUser === null) return null;

        const responseToDestination = await fetch(
          `https://maps.googleapis.com/maps/api/directions/json?origin=${userLatitude},${userLongitude}&destination=${destinationLatitude},${destinationLongitude}&key=${directionsAPI}`,
        );
        const dataToDestination = await responseToDestination.json();
        const timeToDestination = getDurationSeconds(dataToDestination);
        if (timeToDestination === null) return null;

        const distanceToDestination = getDistanceMeters(dataToDestination);
        if (distanceToDestination === null) return null;

        const totalTime = (timeToUser + timeToDestination) / 60;
        const distanceKm = distanceToDestination / 1000;
        const price = estimateFareMRU(distanceKm).toString();

        return {
          ...marker,
          time: totalTime,
          distance: distanceKm,
          price,
        };
      } catch (error) {
        console.error("Error calculating driver times:", error);
        return null;
      }
    }),
  );

  return results.filter((marker): marker is MarkerData => marker !== null);
};
