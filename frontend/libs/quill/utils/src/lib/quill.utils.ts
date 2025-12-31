import Quill from 'quill';

export function extractSemanticAndContent(quill: Quill) {
	const innerHTML = quill.root.innerHTML;
	// add the innerHTML to another document and remove all span with resize-handle class
	const tempDoc = document.createElement('div');
	tempDoc.innerHTML = innerHTML;
	const handles = tempDoc.querySelectorAll('.resize-handle');
	handles.forEach((handle) => {
		handle.remove();
	});
	const newInnerHTML = tempDoc.innerHTML;
	const delta = quill.getContents();
	// delete the tempDoc
	tempDoc.remove();
	return {
		semanticHTML: newInnerHTML,
		content: delta,
	};
}
