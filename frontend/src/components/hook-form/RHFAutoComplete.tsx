import type { ReactNode } from "react";
import { useFormContext, Controller } from "react-hook-form";
import { Autocomplete, TextField } from "@mui/material";

interface RHFAutoCompleteProps {
  name: string;
  label?: string;
  helperText?: ReactNode;
  options: readonly unknown[];
  [key: string]: unknown;
}

export default function RHFAutoComplete({
  name,
  label,
  helperText,
  options,
  ...other
}: RHFAutoCompleteProps) {
  const { control, setValue } = useFormContext();
  return (
    <Controller
      name={name}
      control={control}
      render={({ field, fieldState: { error } }) => (
        <Autocomplete
          {...field}
          fullWidth
          options={options} // Pass options to Autocomplete component
          value={
            typeof field.value === "number" && field.value === 0
              ? ""
              : field.value
          }
          onChange={(event, newValue) =>
            setValue(name, newValue, { shouldValidate: true })
          }
          {...({ error: !!error } as object)}
          {...(other as object)}
          renderInput={(params) => (
            <TextField
              label={label}
              error={!!error}
              helperText={error ? error.message : helperText}
              {...params}
            />
          )}
        />
      )}
    />
  );
}
