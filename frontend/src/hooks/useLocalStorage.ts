import { useState, useEffect } from "react";

// ----------------------------------------------------------------------

type SetValue<T> = (newValue: T | ((currentValue: T) => T)) => void;

export default function useLocalStorage<T>(
  key: string,
  defaultValue: T
): [T, SetValue<T>] {
  const [value, setValue] = useState<T>(() => {
    const storedValue = localStorage.getItem(key);

    return storedValue === null ? defaultValue : (JSON.parse(storedValue) as T);
  });

  useEffect(() => {
    const listener = (e: StorageEvent) => {
      if (e.storageArea === localStorage && e.key === key) {
        setValue(JSON.parse(e.newValue as string) as T);
      }
    };
    window.addEventListener("storage", listener);

    return () => {
      window.removeEventListener("storage", listener);
    };
  }, [key, defaultValue]);

  const setValueInLocalStorage: SetValue<T> = (newValue) => {
    setValue((currentValue) => {
      const result =
        typeof newValue === "function"
          ? (newValue as (currentValue: T) => T)(currentValue)
          : newValue;

      localStorage.setItem(key, JSON.stringify(result));

      return result;
    });
  };

  return [value, setValueInLocalStorage];
}
