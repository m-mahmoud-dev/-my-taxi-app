import { useAuth } from "@clerk/clerk-expo";
import { router } from "expo-router";
import { useState } from "react";
import { Alert, Image, Text, View } from "react-native";
import { ReactNativeModal } from "react-native-modal";

import CustomButton from "@/components/CustomButton";
import { images } from "@/constants";
import { fetchAPI } from "@/lib/fetch";
import { t } from "@/lib/i18n";
import { formatMRU } from "@/lib/utils";
import { useLocationStore } from "@/store";

const ConfirmBooking = ({
  driverId,
  rideTime,
  rideDistance,
  amount,
}: {
  driverId: number;
  rideTime: number;
  rideDistance: number;
  amount: string;
}) => {
  const { getToken } = useAuth();
  const {
    userAddress,
    userLatitude,
    userLongitude,
    destinationAddress,
    destinationLatitude,
    destinationLongitude,
  } = useLocationStore();

  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleConfirm = async () => {
    if (!userLatitude || !userLongitude) {
      Alert.alert(t("book.missingPickup"), t("book.missingPickupDesc"));
      return;
    }
    if (!destinationLatitude || !destinationLongitude) {
      Alert.alert(
        t("book.missingDestination"),
        t("book.missingDestinationDesc"),
      );
      return;
    }

    setSubmitting(true);

    try {
      const token = await getToken();

      await fetchAPI("/(api)/ride/create", {
        method: "POST",
        token: token ?? undefined,
        body: JSON.stringify({
          origin_address: userAddress,
          destination_address: destinationAddress,
          origin_latitude: userLatitude,
          origin_longitude: userLongitude,
          destination_latitude: destinationLatitude,
          destination_longitude: destinationLongitude,
          ride_time: Math.round(rideTime),
          distance_km: Number(rideDistance.toFixed(2)),
          driver_id: driverId,
          payment_method: "cash",
        }),
      });

      setSuccess(true);
    } catch (err) {
      Alert.alert(
        t("book.bookingFailed"),
        err instanceof Error ? err.message : t("book.tryAgain"),
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <CustomButton
        title={submitting ? t("book.booking") : t("confirm.confirm")}
        className="my-10"
        onPress={handleConfirm}
        disabled={submitting}
      />

      <ReactNativeModal
        isVisible={success}
        onBackdropPress={() => setSuccess(false)}
      >
        <View className="flex flex-col items-center justify-center bg-white p-7 rounded-2xl">
          <Image source={images.check} className="w-28 h-28 mt-5" />

          <Text className="text-2xl text-center font-JakartaBold mt-5">
            {t("book.confirmed")}
          </Text>

          <Text className="text-md text-general-200 font-JakartaRegular text-center mt-3">
            {t("book.payInCash", undefined, {
              amount: formatMRU(amount),
            })}
          </Text>

          <CustomButton
            title={t("book.ok")}
            onPress={() => {
              setSuccess(false);
              router.push("/(root)/(tabs)/home");
            }}
            className="mt-5"
          />
        </View>
      </ReactNativeModal>
    </>
  );
};

export default ConfirmBooking;
