const educationBtn = document.getElementById('education-btn');
const trainingBtn = document.getElementById('training-btn');
const educationTimeline = document.getElementById('education-timeline');
const trainingTimeline = document.getElementById('training-timeline');

let educationVisible = true;
let trainingVisible = true;

function updateTimelines() {
    educationTimeline.classList.toggle('hidden', !educationVisible);
    educationBtn.classList.toggle('active', educationVisible);

    trainingTimeline.classList.toggle('hidden', !trainingVisible);
    trainingBtn.classList.toggle('active', trainingVisible);

    if (educationVisible && trainingVisible) {
        educationTimeline.classList.remove('hidden', 'full-width');
        trainingTimeline.classList.remove('hidden', 'full-width');
        educationTimeline.classList.add('half-width');
        trainingTimeline.classList.add('half-width');
    } else if (educationVisible) {
        educationTimeline.classList.remove('hidden', 'half-width');
        trainingTimeline.classList.add('hidden');
        educationTimeline.classList.add('full-width');

    } else if (trainingVisible) {
        trainingTimeline.classList.remove('hidden', 'half-width');
        educationTimeline.classList.add('hidden');
        trainingTimeline.classList.add('full-width');
    } else {
        educationTimeline.classList.add('hidden');
        trainingTimeline.classList.add('hidden');
    }
}

educationBtn.addEventListener('click', () => {
    educationVisible = !educationVisible;
    updateTimelines();
});

trainingBtn.addEventListener('click', () => {
    trainingVisible = !trainingVisible;
    updateTimelines();
});

updateTimelines();