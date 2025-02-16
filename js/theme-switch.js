document.addEventListener('DOMContentLoaded', function() {
    const themeSwitcherInput = document.querySelector('.switcher__input'); 

    themeSwitcherInput.addEventListener('change', function() {
        if (!this.checked) {
            document.body.classList.add('dark-theme'); 
        } else {
            document.body.classList.remove('dark-theme');
        }
    });
});