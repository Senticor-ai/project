import { ImportDialog } from "../shared/ImportDialog";
import type { ImportDialogProps } from "../shared/ImportDialog";
import { nativeConfig } from "./useNativeImport";

export type NativeImportDialogProps = Omit<ImportDialogProps, "config">;

export function NativeImportDialog(props: NativeImportDialogProps) {
  return <ImportDialog {...props} config={nativeConfig} />;
}
