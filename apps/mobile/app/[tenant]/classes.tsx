import { useTenant } from "@accedu/api/react";
import { useLocalSearchParams } from "expo-router";
import { MyClasses } from "../../src/MyClasses";

export default function Classes() {
  const { tenant: slug } = useLocalSearchParams<{ tenant: string }>();
  const tenant = useTenant(slug);
  return <MyClasses slug={slug} tenantId={tenant.data?.id} />;
}
