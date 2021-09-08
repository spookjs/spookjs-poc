function mode(count, f) {
    const a = [];

    for (let i = 0; i < count; i++) {
        a.push(f());
    }

    a.sort((x, y) => x - y);

    var bestStreak = 1;
    var bestElem = a[0];
    var currentStreak = 1;
    var currentElem = a[0];

    for (let i = 1; i < a.length; i++) {
        if (a[i - 1] !== a[i]) {
            if (currentStreak > bestStreak) {
                bestStreak = currentStreak;
                bestElem = currentElem;
            }

            currentStreak = 0;
            currentElem = a[i];
        }

        currentStreak++;
    }

    return currentStreak > bestStreak ? currentElem : bestElem;
}