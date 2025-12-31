export type CallbackFunction = (
	callbackValue:
		| { action: 'edit'; newUrl: string | undefined }
		| {
				action: 'delete';
		  }
		| any
) => void;
