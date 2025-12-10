/**
 * Modal management module
 * Handles opening and closing of modal dialogs
 */

/**
 * Open a modal dialog by ID
 */
export function openModal(modalId: string): void {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.add("active");
    }
}

/**
 * Close a modal dialog by ID
 */
export function closeModal(modalId: string): void {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.remove("active");
    }
}
