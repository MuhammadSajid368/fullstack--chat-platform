import type { ReactNode, BaseSyntheticEvent } from "react";
import { FormProvider as Form } from "react-hook-form";
import type { UseFormReturn, FieldValues } from "react-hook-form";

interface FormProviderProps {
  children: ReactNode;
  onSubmit?: (e?: BaseSyntheticEvent) => void | Promise<void>;
  methods: UseFormReturn<FieldValues>;
}

const FormProvider = ({ children, onSubmit, methods }: FormProviderProps) => {
  return (
    <Form {...methods}>
      <form onSubmit={onSubmit}>{children}</form>
    </Form>
  );
};

export default FormProvider;
